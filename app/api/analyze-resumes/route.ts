import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  JDKeywords,
  mapEduLevel,
  eduFit,
  clamp01,
  cleanSkillTokens,
  domainSignatureFromJD,
  detectDomainMismatch,
  guessYearsExperience,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* concurrency gate */
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const run = queue.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}

/* extract resume text from file */
async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse")).default;
    const res = await pdf(buf);
    const t = res.text || "";
    // pdf-parse sometimes returns line breaks only; normalize
    return t.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value || "").trim();
  }
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return convert(buf.toString("utf8"));
  }
  return buf.toString("utf8");
}

/* types shared w/ UI (duplicated for route safety) */
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
  formatted?: string;
  domainMismatch?: boolean;
  domainHints?: string[];
};
type AnalysisResult = {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: { keywords: JDKeywords };
};

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

    // Derive JD keywords (role-agnostic) and domain signature
    const [keywords] = await Promise.all([llmDeriveKeywords(JD)]);
    const domainSig = domainSignatureFromJD(JD);

    const limit = createLimiter(10);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const text = await extractTextFromFile(f);

            // LLMs (profile + human rubric, in parallel)
            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            // Heuristic evidence
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Domain detection (automatic signature from JD)
            const domain = detectDomainMismatch(text, domainSig);

            // Experience — LLM + regex + dates fusion
            const years = Number(
              guessYearsExperience(text, llmRubric?.yearsExperienceEstimate || profile?.yearsExperience)
            );

            // Education
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean).join(", ")
                : (llmRubric?.educationSummary || "");
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);

            // LLM score normalized
            const llmNorm = (llmRubric?.score || 0) / 100;

            // Base blended score
            let overall = 0.55 * h.coverage + 0.25 * (job.minYearsExperience ? years / job.minYearsExperience : 1) + 0.1 * eduScore + 0.1 * llmNorm;
            overall = clamp01(overall);

            // If domain mismatch, clamp way down and strip questions/narrative noise
            const domainMismatch = domain.mismatch;
            if (domainMismatch) {
              overall = Math.min(overall, 0.05); // ~0–5%
            }

            const matchScore = Math.round(100 * overall);

            // Skills – merge & clean (remove junk like "best", "practices", "strong")
            const mergedSkills = cleanSkillTokens([
              ...(Array.isArray(profile?.skills) ? profile.skills : []).map(String),
              ...(Array.isArray(llmRubric?.matchedSkills) ? llmRubric.matchedSkills : []).map(String),
              ...h.matched,
            ]);

            // Narrative
            const strengths = domainMismatch ? [] : [
              ...(Array.isArray(llmRubric?.strengths) ? llmRubric.strengths : []),
              ...(h.matched.length ? [`Strong evidence for: ${h.matched.slice(0, 10).join(", ")}`] : []),
            ];
            const missing = h.missing;
            const weaknesses = domainMismatch ? [] : [
              ...(Array.isArray(llmRubric?.weaknesses) ? llmRubric.weaknesses : []),
              ...(missing.length ? [`Missing vs JD: ${missing.slice(0, 8).join(", ")}`] : []),
            ];

            const questions = domainMismatch ? [] : (Array.isArray(llmRubric?.questions) ? llmRubric.questions : []);

            const formatted = domainMismatch
              ? `Candidate appears to be from a different domain than the JD.\nOverall Match: ${matchScore}%`
              : "";

            candidates.push({
              id: crypto.randomUUID(),
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt|html?)$/i, ""),
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
              gaps: domainMismatch ? [] : missing.map((m: string) => `Skill gap: ${m}`),
              mentoringNeeds: domainMismatch ? [] : missing.slice(0, 3).map((m: string) => `Mentorship in ${m}`),
              questions,
              formatted,
              domainMismatch,
              domainHints: domain.mismatch ? domainSig.slice(0, 6) : domain.hits.slice(0, 6),
            });
          } catch (e: any) {
            errors.push({ file: f.name, message: String(e?.message || e) });
          }
        })
      )
    );

    // rank by score
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
