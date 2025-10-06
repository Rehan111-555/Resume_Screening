import { NextRequest, NextResponse } from "next/server";
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

/* Basic helpers */
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
  return buf.toString("utf8");
}

/* Types shared with UI */
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

/* Route */
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

    // Derive JD keywords (role-agnostic)
    const keywords = await llmDeriveKeywords(JD);

    const limit = createLimiter(10);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const text = await extractTextFromFile(f);
            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            // Heuristic evidence (strict)
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Experience
            const years = Number(
              (profile?.yearsExperience || llmRubric?.yearsExperienceEstimate || 0).toFixed(2)
            );
            const expFit = clamp01(
              job.minYearsExperience ? years / job.minYearsExperience : 1
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

            // Blended overall score
            const llmNorm = (llmRubric?.score || 0) / 100;
            const overall = 0.55 * h.coverage + 0.25 * expFit + 0.1 * eduScore + 0.1 * llmNorm;
            const matchScore = Math.round(100 * clamp01(overall));

            // Skills (merged)
            const mergedSkills = Array.from(
              new Set<string>([
                ...(Array.isArray(profile?.skills) ? profile.skills : []).map(String),
                ...(Array.isArray(llmRubric?.matchedSkills) ? llmRubric.matchedSkills : []).map(String),
                ...h.matched,
              ].filter(Boolean))
            );

            // Narrative
            const strengths = [
              ...(Array.isArray(llmRubric?.strengths) ? llmRubric.strengths : []),
              ...(h.matched.length ? [`Strong evidence for: ${h.matched.slice(0, 10).join(", ")}`] : []),
            ];
            const missing = h.missing;
            const weaknesses = [
              ...(Array.isArray(llmRubric?.weaknesses) ? llmRubric.weaknesses : []),
              ...(missing.length ? [`Missing vs JD: ${missing.slice(0, 8).join(", ")}`] : []),
            ];

            candidates.push({
              id: crypto.randomUUID(),
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt)$/i, ""),
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
              gaps: missing.map((m: string) => `Skill gap: ${m}`),
              mentoringNeeds: missing.slice(0, 3).map((m: string) => `Mentorship in ${m}`),
              questions: Array.isArray(llmRubric?.questions) ? llmRubric.questions : [],
            });
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
