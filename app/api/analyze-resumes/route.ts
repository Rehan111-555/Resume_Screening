import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert as htmlToText } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  JDKeywords,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const run = queue.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}

function mapEduLevel(s: string): string {
  const x = (s || "").toLowerCase();
  if (/ph\.?d|doctor/i.test(x)) return "PhD";
  if (/master|msc|ms\b/i.test(x)) return "Master";
  if (/bachelor|bs\b|bsc\b/i.test(x)) return "Bachelor";
  if (/intermediate|high school|hs/i.test(x)) return "Intermediate/High School";
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
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** ---------- Content extraction for multiple formats ---------- */
async function ocrImage(buffer: Buffer): Promise<string> {
  // Optional OCR for images; if this fails, we return an empty string and the caller will handle it.
  try {
    const { createWorker } = await import("tesseract.js");
    // tesseract.js uses CDN for traineddata by default; that works on Vercel.
    const worker = await createWorker({});
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data?.text || "";
  } catch {
    return "";
  }
}

async function extractTextFromFile(file: File): Promise<{ text: string; kind: string }> {
  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  // PDF
  if (name.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse")).default;
    const res = await pdf(buf);
    return { text: (res.text || "").trim(), kind: "pdf" };
  }

  // DOCX
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: (value || "").trim(), kind: "docx" };
  }

  // Plain HTML -> text
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const text = htmlToText(buf.toString("utf8"), { wordwrap: false });
    return { text: text.trim(), kind: "html" };
  }

  // Images (PNG/JPG/JPEG)
  if (/\.(png|jpg|jpeg|gif|webp)$/i.test(name)) {
    const text = await ocrImage(buf);
    return { text: text.trim(), kind: "image" };
  }

  // Fallback: treat as UTF-8 text
  return { text: buf.toString("utf8").trim(), kind: "text" };
}

/** ---------- Shared types with UI ---------- */
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
};
type AnalysisResult = {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: { keywords: JDKeywords };
};

/** ---------- Route ---------- */
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

    // Role-agnostic JD keywords
    const keywords = await llmDeriveKeywords(JD);

    const limit = createLimiter(8);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const { text, kind } = await extractTextFromFile(f);
            if (!text) {
              throw new Error(
                kind === "image"
                  ? "OCR failed for image resume."
                  : "Could not read resume text."
              );
            }

            // Stable hash so duplicates always map to the same ID
            const stableId = crypto.createHash("sha256").update(text).digest("hex");

            // LLM passes run at temperature 0 (deterministic)
            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            // Heuristic evidence against JD keywords (strict)
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Experience (deterministic rounding)
            const years = Number(
              (profile?.yearsExperience || llmRubric?.yearsExperienceEstimate || 0).toFixed(2)
            );

            // Education
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : (llmRubric?.educationSummary || "");
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);

            // Domain-mismatch: if NONE of the "must" keywords hit, force 0 score and mark
            const domainMatched = h.matched.length > 0 || (keywords.must || []).some(k =>
              (k.synonyms || [k.name]).some(s => text.toLowerCase().includes(s.toLowerCase()))
            );

            let matchScore = 0;
            if (domainMatched) {
              const llmNorm = (llmRubric?.score || 0) / 100;
              const expFit = clamp01(
                job.minYearsExperience ? years / job.minYearsExperience : 1
              );
              const overall = 0.65 * h.coverage + 0.15 * expFit + 0.1 * eduScore + 0.1 * llmNorm;
              matchScore = Math.round(100 * clamp01(overall));
            } else {
              // override to 0
              matchScore = 0;
            }

            // Skills merged & deduped
            const mergedSkills = Array.from(
              new Set<string>([
                ...(Array.isArray(profile?.skills) ? profile.skills : []).map(String),
                ...(Array.isArray(llmRubric?.matchedSkills) ? llmRubric.matchedSkills : []).map(String),
                ...h.matched,
              ].filter(Boolean))
            );

            const strengths = [
              ...(Array.isArray(llmRubric?.strengths) ? llmRubric.strengths : []),
              ...(h.matched.length ? [`Strong evidence for: ${h.matched.slice(0, 10).join(", ")}`] : []),
            ];

            const missing = h.missing;
            const weaknesses = [
              ...(Array.isArray(llmRubric?.weaknesses) ? llmRubric.weaknesses : []),
              ...(missing.length ? [`Missing vs JD: ${missing.slice(0, 8).join(", ")}`] : []),
              ...(domainMatched ? [] : ["Domain not matching the JD"]),
            ];

            candidates.push({
              id: stableId, // stable for duplicates
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt|html?|png|jpg|jpeg|gif|webp)$/i, ""),
              email: profile?.email || "",
              phone: profile?.phone || "",
              location: profile?.location || "",
              title: profile?.headline || (profile?.experience?.[0]?.title || ""),
              yearsExperience: years,
              education: eduLabel || eduStr || "",
              skills: mergedSkills,
              summary: profile?.summary || text.slice(0, 500).replace(/\s+/g, " "),
              matchScore,
              skillsEvidencePct,
              strengths,
              weaknesses,
              gaps: domainMatched
                ? missing.map((m: string) => `Skill gap: ${m}`)
                : ["Domain not matching the JD"],
              mentoringNeeds: domainMatched
                ? missing.slice(0, 3).map((m: string) => `Mentorship in ${m}`)
                : ["Domain alignment"],
              questions: Array.isArray(llmRubric?.questions) ? llmRubric.questions : [],
            });
          } catch (e: any) {
            errors.push({ file: f.name, message: String(e?.message || e) });
          }
        })
      )
    );

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
