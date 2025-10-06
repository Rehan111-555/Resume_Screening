import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  JDKeywords,
  detectDomainMismatch,
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
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

/** Parse text from multiple formats (PDF/DOC/DOCX/HTML/TXT). */
async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse")).default;
    const res = await pdf(buf);
    return res.text || "";
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value || "";
  }
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const html = buf.toString("utf8");
    return convert(html, { wordwrap: false }) || "";
  }
  return buf.toString("utf8");
}

type JobRequirements = {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
};

type Candidate = import("@/types").Candidate;

type AnalysisResult = {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: { keywords: JDKeywords };
};

/** Build your copy-ready report exactly in your requested format. */
function formatReport(c: Candidate): string {
  const esc = (s: string) => (s || "").replace(/\s+$/g, "");

  const lines: string[] = [];
  lines.push(`## Candidate Details — **${esc(c.name)}**`);
  lines.push("");
  lines.push(`**Personal Information**`);
  lines.push("");
  lines.push(`* Email: ${c.email || "Not specified"}`);
  lines.push(`* Phone: ${c.phone || "Not specified"}`);
  lines.push(`* Location: ${c.location || "Not specified"}`);
  lines.push("");
  lines.push(`**Professional Summary**`);
  lines.push(esc(c.summary || "—"));
  lines.push("");
  lines.push(`**Match Breakdown**`);
  lines.push("");
  lines.push(`* **Overall Match:** ${c.matchScore}%${c.domainNotMatching ? " (Domain not matching)" : ""}`);
  lines.push(`* **Experience:** ${Number.isFinite(c.yearsExperience) ? `${c.yearsExperience} years` : "—"}`);
  lines.push(`* **Skills & Evidence:** ${c.skillsEvidencePct}%`);
  lines.push(`* **Education:** ${c.education || "—"}`);
  lines.push("");
  lines.push("**Skills**");
  lines.push((c.skills && c.skills.length ? c.skills.join(", ") : "—"));
  if (c.questions?.length) {
    lines.push("");
    lines.push("**AI Interview Questions**");
    c.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  if (c.strengths?.length) {
    lines.push("");
    lines.push("**Strengths**");
    c.strengths.forEach((s) => lines.push(`* ${s}`));
  }
  if (c.weaknesses?.length) {
    lines.push("");
    lines.push("**Areas for Improvement**");
    c.weaknesses.forEach((w) => lines.push(`* ${w}`));
  }
  if (c.gaps?.length) {
    lines.push("");
    lines.push("**Identified Gaps (vs JD)**");
    c.gaps.forEach((g) => lines.push(`* ${g}`));
  }
  if (c.mentoringNeeds?.length) {
    lines.push("");
    lines.push("**Mentoring Needs**");
    c.mentoringNeeds.forEach((m) => lines.push(`* ${m}`));
  }
  return lines.join("\n");
}

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

    const keywords = await llmDeriveKeywords(JD);
    const limit = createLimiter(10);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const text = await extractTextFromFile(f);

            // LLM helpers + strict heuristic
            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            const years = Number((profile?.yearsExperience || llmRubric?.yearsExperienceEstimate || 0).toFixed(2));
            const expFit = clamp01(job.minYearsExperience ? years / job.minYearsExperience : 1);
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : (llmRubric?.educationSummary || "");
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);
            const llmNorm = (llmRubric?.score || 0) / 100;

            // Base (pre-domain) score
            let blended = 0.55 * h.coverage + 0.25 * expFit + 0.10 * eduScore + 0.10 * llmNorm;
            blended = clamp01(blended);
            let matchScore = Math.round(100 * blended);

            // Domain mismatch?
            const domainMismatch = detectDomainMismatch(JD, text, h.coverage);

            if (domainMismatch) {
              matchScore = 0; // hard zero
            }

            // Skills merged & narratives
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
            ];

            const candidate: Candidate = {
              id: crypto.randomUUID(),
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt|html|htm)$/i, ""),
              email: profile?.email || "",
              phone: profile?.phone || "",
              location: profile?.location || "",
              title: profile?.headline || (profile?.experience?.[0]?.title || ""),
              yearsExperience: years,
              education: eduLabel || eduStr || "",
              skills: mergedSkills,
              summary:
                domainMismatch
                  ? "Domain not matching the Job Description."
                  : (profile?.summary || text.slice(0, 500).replace(/\s+/g, " ")),
              matchScore,
              skillsEvidencePct,
              strengths,
              weaknesses,
              gaps: (domainMismatch ? ["Domain gap: candidate background not aligned with JD domain"] : [])
                .concat(missing.map((m: string) => `Skill gap: ${m}`)),
              mentoringNeeds: (domainMismatch ? ["Guidance to transition into the JD domain"] : [])
                .concat(missing.slice(0, 3).map((m: string) => `Mentorship in ${m}`)),
              questions: Array.isArray(llmRubric?.questions) ? llmRubric.questions : [],
              domainNotMatching: domainMismatch,
              formatted: "", // fill below
            };

            candidate.formatted = formatReport(candidate);
            candidates.push(candidate);
          } catch (e: any) {
            errors.push({ file: f.name, message: String(e?.message || e) });
          }
        })
      )
    );

    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const result: AnalysisResult = {
      candidates,
      errors,
      meta: { keywords },
    };
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
