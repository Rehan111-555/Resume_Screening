import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  JDKeywords,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ───────────────────────── Concurrency limiter ───────────────────────── */
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const run = queue.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}

/* ───────────────────────── Helpers ───────────────────────── */
function sha1(buf: Buffer) { return crypto.createHash("sha1").update(buf).digest("hex"); }
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function mapEduLevel(s: string): string {
  const x = (s || "").toLowerCase();
  if (/ph\.?d|doctor/i.test(x)) return "PhD";
  if (/master|msc|ms\b/i.test(x)) return "Master";
  if (/bachelor|bs\b|bsc\b/i.test(x)) return "Bachelor";
  if (/intermediate|high school|hs/i.test(x)) return "Intermediate/High School";
  if (/diploma|associate/i.test(x)) return "Associate/Diploma";
  return s || "";
}
function eduFit(required?: string, have?: string): number {
  const r = (required || "").toLowerCase();
  const h = (have || "").toLowerCase();
  if (!r) return 0.7;
  if (r.includes("phd")) return h.includes("phd") ? 1 : 0.6;
  if (r.includes("master")) return h.match(/phd|master/) ? 1 : h.includes("bachelor") ? 0.7 : 0.4;
  if (r.includes("bachelor")) return h.match(/phd|master|bachelor/) ? 1 : 0.5;
  return h ? 0.7 : 0.3;
}

/* ───────────────────────── Text extraction (multi-format + OCR) ───────────────────────── */
async function extractTextFromFile(file: File): Promise<{ text: string; hash: string }> {
  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = sha1(buf);

  // Plain text
  if (name.endsWith(".txt")) {
    return { text: buf.toString("utf8"), hash };
  }

  // HTML
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const html = buf.toString("utf8");
    return { text: convert(html, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] }), hash };
  }

  // DOCX/DOC
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: value || "", hash };
  }

  // PDF (try native text, then OCR if it looks scanned)
  if (name.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse")).default;
    const res = await pdf(buf);
    let text = res.text || "";

    // If there’s almost no text, run OCR on the binary
    if ((text || "").trim().length < 50) {
      const { createWorker } = await import("tesseract.js");
      // Tesseract on the whole PDF binary is not ideal, but catches embedded images in many CVs on Vercel.
      const worker = await createWorker({ logger: () => {} });
      await worker.loadLanguage("eng");
      await worker.initialize("eng");
      const { data } = await worker.recognize(buf);
      text = data?.text || "";
      await worker.terminate();
    }
    return { text, hash };
  }

  // Images → OCR
  if (/\.(png|jpg|jpeg|webp|gif|bmp|heic)$/.test(name)) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker({ logger: () => {} });
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const { data } = await worker.recognize(buf);
    const text = data?.text || "";
    await worker.terminate();
    return { text, hash };
  }

  // Fallback: try as UTF-8
  return { text: buf.toString("utf8"), hash };
}

/* ───────────────────────── Types shared with UI ───────────────────────── */
type JobRequirements = {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
};
type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;
  matchScore: number;
  skillsEvidencePct: number;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions: string[];
  domainMismatch?: boolean;
  domainNote?: string;
};
type AnalysisResult = {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: { keywords: JDKeywords };
};

/* ───────────────────────── Route ───────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const job: JobRequirements = JSON.parse(jrRaw);
    const JD = `${job.title || ""}\n\n${job.description || ""}`;

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json({ error: "No resumes uploaded (field name must be 'resumes')." }, { status: 400 });
    }
    if (resumeFiles.length > 100) {
      return NextResponse.json({ error: "Limit 100 resumes per batch." }, { status: 400 });
    }

    // JD → keywords (role-agnostic)
    const keywords = await llmDeriveKeywords(JD);

    // Process resumes
    const limit = createLimiter(6); // OCR can be chunky; 6 is safe on Vercel Node
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const { text, hash } = await extractTextFromFile(f);

            // LLM profile + rubric (deterministic settings in client)
            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            // Heuristic evidence (strict + deterministic)
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Experience
            const years = Number(
              (profile?.yearsExperience || llmRubric?.yearsExperienceEstimate || 0).toFixed(2)
            );
            const expFit = clamp01(job.minYearsExperience ? years / job.minYearsExperience : 1);

            // Education
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : (llmRubric?.educationSummary || "");
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);

            // Domain-mismatch logic (generic, not just Shopify)
            // If we miss ≥85% of MUST keywords, call it a domain mismatch.
            const mustCount = (keywords.must || []).length;
            const matchedMust = (keywords.must || []).filter(m => h.matched.includes((m.name || "").toLowerCase())).length;
            const domainMismatch = mustCount >= 4 ? (matchedMust / mustCount) < 0.15 : skillsEvidencePct < 10;

            // Blended overall score (force zero for domain mismatch)
            const llmNorm = (llmRubric?.score || 0) / 100;
            const overall = 0.55 * h.coverage + 0.25 * expFit + 0.10 * eduScore + 0.10 * llmNorm;
            const matchScore = domainMismatch ? 0 : Math.round(100 * clamp01(overall));

            // Skills (merged + de-duped)
            const mergedSkills = Array.from(
              new Set<string>([
                ...(Array.isArray(profile?.skills) ? profile.skills : []).map(String),
                ...(Array.isArray(llmRubric?.matchedSkills) ? llmRubric.matchedSkills : []).map(String),
                ...h.matched,
              ].filter(Boolean).map(s => s.trim()))
            );

            // Narrative
            const missing = h.missing;
            const strengths = [
              ...(Array.isArray(llmRubric?.strengths) ? llmRubric.strengths : []),
              ...(h.matched.length ? [`Strong evidence for: ${h.matched.slice(0, 10).join(", ")}`] : []),
            ];
            const weaknesses = [
              ...(Array.isArray(llmRubric?.weaknesses) ? llmRubric.weaknesses : []),
              ...(missing.length ? [`Missing vs JD: ${missing.slice(0, 8).join(", ")}`] : []),
            ];
            if (domainMismatch) weaknesses.unshift("Domain not matching the JD");

            candidates.push({
              id: hash, // deterministic id for duplicate uploads
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt|html|htm|png|jpg|jpeg|webp|gif|bmp|heic)$/i, ""),
              email: profile?.email || "",
              phone: profile?.phone || "",
              location: profile?.location || "",
              title: profile?.headline || (profile?.experience?.[0]?.title || ""),
              yearsExperience: years,
              education: eduLabel || eduStr || "",
              skills: mergedSkills,
              summary: profile?.summary || text.slice(0, 500).replace(/\s+/g, " "),
              matchScore,
              skillsEvidencePct: domainMismatch ? 0 : skillsEvidencePct,
              strengths,
              weaknesses,
              gaps: (domainMismatch ? ["Domain gap: JD domain not found in resume"] : [])
                .concat(missing.map((m: string) => `Skill gap: ${m}`)),
              mentoringNeeds: (domainMismatch ? ["Mentorship: transition to JD’s domain"] : [])
                .concat(missing.slice(0, 3).map((m: string) => `Mentorship in ${m}`)),
              questions: Array.isArray(llmRubric?.questions) ? llmRubric.questions : [],
              domainMismatch,
              domainNote: domainMismatch ? "Domain not matching" : undefined,
            });
          } catch (e: any) {
            errors.push({ file: f.name, message: String(e?.message || e) });
          }
        })
      )
    );

    // Sort by score (zeros at the end)
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const result: AnalysisResult = { candidates, errors, meta: { keywords } };
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
