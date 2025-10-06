import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  mapEduLevel,
  eduFit,
  clamp01,
  estimateExperienceYears,
  inferDomainTokensFromJD,
  resumeMatchesDomain,
  type JDKeywords,
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

/* ---------- file → text (multi-format) ---------- */
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
    return convert(buf.toString("utf8"));
  }
  return buf.toString("utf8");
}

/* ---------- helpers ---------- */
const JUNK_GAP_WORDS = new Set([
  "best","practices","practice","proactive","strong","experience","understanding","customizing",
  "development","developer","process","processes"
]);
const ONLY_ALPHA = /[a-z]/i;

function asSkillLike(s: string): boolean {
  const t = (s || "").toLowerCase().trim();
  if (!t || t.length < 3) return false;
  if (!ONLY_ALPHA.test(t)) return false;
  if (JUNK_GAP_WORDS.has(t)) return false;
  return true;
}

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
  formatted?: string;
};
type AnalysisResult = {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: { keywords: JDKeywords; domainTokens: string[] };
};

/* ---------- route ---------- */
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

    // Derive JD keywords + infer domain tokens automatically (no hardcoding)
    const [keywords, domainTokens] = await Promise.all([
      llmDeriveKeywords(JD),
      Promise.resolve(inferDomainTokensFromJD(job.title || "", job.description || "")),
    ]);

    const limit = createLimiter(8);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const text = await extractTextFromFile(f);
            const isDomain = resumeMatchesDomain(text, domainTokens);

            // short-circuit: if domain mismatch => we STILL parse but score is 0 and hide extras.
            const [profile, rubric] = await Promise.all([
              llmExtractProfile(text),
              isDomain ? llmGradeCandidate(JD, text) : Promise.resolve<any>({ score: 0 })
            ]);

            // Evidence (deterministic)
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Experience: prefer profile → rubric → regex dates
            let years = Number(
              (profile?.yearsExperience || rubric?.yearsExperienceEstimate || 0)
            );
            if (!Number.isFinite(years) || years <= 0) {
              years = estimateExperienceYears(text);
            }
            years = Number((years || 0).toFixed(2));

            // Education
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : (rubric?.educationSummary || "");
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);

            // Overall (if domain mismatch => 0)
            const expFit = clamp01(
              job.minYearsExperience ? (years / Math.max(0.1, job.minYearsExperience)) : 1
            );
            const llmNorm = (rubric?.score || 0) / 100;
            let overall = 0.55 * h.coverage + 0.25 * expFit + 0.10 * eduScore + 0.10 * llmNorm;
            overall = isDomain ? clamp01(overall) : 0;
            const matchScore = Math.round(100 * overall);

            // Skills (merged)
            const mergedSkills = Array.from(
              new Set<string>([
                ...(Array.isArray(profile?.skills) ? profile.skills : []).map(String),
                ...(Array.isArray(rubric?.matchedSkills) ? rubric.matchedSkills : []).map(String),
                ...h.matched,
              ].filter(Boolean))
            );

            // Narrative (strip junk)
            const strengths = (Array.isArray(rubric?.strengths) ? rubric.strengths : [])
              .filter((x: string) => x && x.length <= 240);
            const missing = h.missing.filter(asSkillLike);
            const weaknesses = (Array.isArray(rubric?.weaknesses) ? rubric.weaknesses : [])
              .concat(missing.length ? [`Missing vs JD: ${missing.slice(0, 8).join(", ")}`] : [])
              .filter(Boolean);

            const questions = (isDomain && matchScore > 0)
              ? (Array.isArray(rubric?.questions) ? rubric.questions : [])
              : [];

            const nameGuess = profile?.name || f.name.replace(/\.(pdf|docx|doc|txt|html?)$/i, "");

            // preformatted MD block in your exact layout
            const formatted = `
Candidate Details — **${nameGuess}**

Personal Information

Email: ${profile?.email || ""}
Phone: ${profile?.phone || ""}
Location: ${profile?.location || ""}

Professional Summary
${(profile?.summary || text.slice(0, 400).replace(/\s+/g, " ")).trim()}

Match Breakdown

Overall Match: ${matchScore}%
Experience: ${years} years
Skills & Evidence: ${skillsEvidencePct}%
Education: ${eduLabel || "N/A"}

Skills
${mergedSkills.slice(0, 30).join(", ")}

AI Interview Questions
${questions.map((q: string) => `• ${q}`).join("\n")}

Strengths
${strengths.map((s: string) => `• ${s}`).join("\n")}

Areas for Improvement
${weaknesses.map((w: string) => `• ${w}`).join("\n")}

Identified Gaps (vs JD)
${missing.map((m: string) => `Skill gap: ${m}`).join("\n")}

Mentoring Needs
${missing.slice(0, 3).map((m: string) => `• Mentorship in ${m}`).join("\n")}

What I’ll do automatically
Parse the resume and JD, align must-have vs nice-to-have skills.
Score Overall Match (skills 65%, experience 15%, education 10%, domain/impact 10%)
`.trim();

            candidates.push({
              id: crypto.randomUUID(),
              name: nameGuess,
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
              questions,
              domainMismatch: !isDomain,
              formatted,
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
      meta: { keywords, domainTokens },
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
