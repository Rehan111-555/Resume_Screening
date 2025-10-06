import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  type JDKeywords,
  mapEduLevel,
  eduFit,
  clamp01,
  cleanTokens,
  estimateYears,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** concurrency limiter (avoid Vercel over-parallel) */
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

function plain(textOrHtml: string): string {
  if (!textOrHtml) return "";
  if (/<[a-z][\s\S]*>/i.test(textOrHtml)) {
    return convert(textOrHtml, { wordwrap: false, selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }] });
  }
  return textOrHtml;
}

/** crude contact heuristics for when LLM misses */
function extractContacts(text: string) {
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "";
  const phone = (text.match(/(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/) || [])[0] || "";
  const locMatch = text.match(/\b([A-Za-z ]+,\s*[A-Za-z ]+)\b/);
  const location = locMatch ? locMatch[1] : "";
  return { email, phone, location };
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
  meta?: { keywords: JDKeywords };
};

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

/** simple domain mismatch check using core JD must-keywords signal */
function detectDomainMismatch(resumeText: string, kw: JDKeywords): boolean {
  const must = kw.must || [];
  if (!must.length) return false;
  const text = resumeText.toLowerCase();
  let coreHits = 0;
  for (const g of must.slice(0, Math.min(6, must.length))) {
    const syns = [g.name, ...(g.synonyms || [])]
      .map((s) => s.toLowerCase())
      .filter((s) => s.length > 2);
    if (syns.some((s) => text.includes(s))) coreHits++;
  }
  const coverage = coreHits / Math.min(6, must.length);
  // if almost none of the core JD terms exist in resume text, mark mismatch
  return coverage < 0.18;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json(
        { error: "Missing jobRequirements (stringified JSON)." },
        { status: 400 }
      );
    }
    const job: JobRequirements = JSON.parse(jrRaw);
    const JD = `${job.title || ""}\n\n${plain(job.description || "")}`;

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json(
        { error: "No resumes uploaded (field name must be 'resumes')." },
        { status: 400 }
      );
    }
    if (resumeFiles.length > 100) {
      return NextResponse.json(
        { error: "Limit 100 resumes per batch." },
        { status: 400 }
      );
    }

    // Derive JD keywords (role-agnostic; no hardcoded list)
    const keywords = await llmDeriveKeywords(JD);

    const limit = createLimiter(10);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const raw = await extractTextFromFile(f);
            const text = plain(raw);

            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Experience (deterministic > LLM)
            const yearsDet = estimateYears(text);
            const yearsLLM = Number(llmRubric?.yearsExperienceEstimate || 0);
            const years = Number(
              (yearsDet || yearsLLM || 0).toFixed(2)
            );

            // Education
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [
                    profile.education[0]?.degree,
                    profile.education[0]?.field,
                    profile.education[0]?.institution,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : llmRubric?.educationSummary || "";
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);

            // Domain check
            const domainMismatch = detectDomainMismatch(text, keywords);

            // blended score (zero if domainMismatch)
            const llmNorm = (llmRubric?.score || 0) / 100;
            const expFit = clamp01(
              job.minYearsExperience ? years / job.minYearsExperience : 1
            );
            let overall =
              0.55 * h.coverage + 0.25 * expFit + 0.1 * eduScore + 0.1 * llmNorm;
            if (domainMismatch) overall *= 0.05; // essentially zero
            const matchScore = Math.round(100 * clamp01(overall));

            // Skills merged & cleaned
            const mergedSkills = cleanTokens(
              Array.from(
                new Set<string>(
                  [
                    ...(Array.isArray(profile?.skills)
                      ? profile.skills
                      : []
                    ).map(String),
                    ...(Array.isArray(llmRubric?.matchedSkills)
                      ? llmRubric.matchedSkills
                      : []
                    ).map(String),
                    ...h.matched,
                  ].filter(Boolean)
                )
              )
            );

            // Narrative (cleaned)
            const strengths = cleanTokens([
              ...(Array.isArray(llmRubric?.strengths)
                ? llmRubric.strengths
                : []),
              ...(h.matched.length
                ? [`strong evidence: ${h.matched.slice(0, 8).join(", ")}`]
                : []),
            ]);
            const missing = cleanTokens(h.missing);
            const weaknesses = cleanTokens([
              ...(Array.isArray(llmRubric?.weaknesses)
                ? llmRubric.weaknesses
                : []),
              ...(missing.length
                ? [`missing vs JD: ${missing.slice(0, 8).join(", ")}`]
                : []),
            ]);

            // when domain mismatch, suppress narrative and questions
            const effectiveStrengths = domainMismatch ? [] : strengths;
            const effectiveWeaknesses = domainMismatch ? [] : weaknesses;
            const effectiveGaps = domainMismatch
              ? []
              : missing.map((m) => `Skill gap: ${m}`);
            const effectiveMentoring = domainMismatch
              ? []
              : missing.slice(0, 3).map((m) => `Mentorship in ${m}`);
            const effectiveQuestions =
              domainMismatch || !Array.isArray(llmRubric?.questions)
                ? []
                : llmRubric.questions;

            // Contacts (fill gaps heuristically)
            const contacts = extractContacts(text);

            // format block for copy
            const formatted = `## Candidate Details — **${profile?.name || f.name.replace(/\.(pdf|docx|doc|txt)$/i, "")}**

**Personal Information**
* Email: ${profile?.email || contacts.email || "Not specified"}
* Phone: ${profile?.phone || contacts.phone || "Not specified"}
* Location: ${profile?.location || contacts.location || "Not specified"}

**Professional Summary**
${profile?.summary || text.slice(0, 500).replace(/\s+/g, " ")}

**Match Breakdown**
* **Overall Match:** ${matchScore}%
* **Experience:** ${years} ${years === 1 ? "year" : "years"}
* **Skills & Evidence:** ${skillsEvidencePct}%
* **Education:** ${eduLabel || eduStr || "—"}

**Skills**
${mergedSkills.join(", ")}

${domainMismatch ? "**Domain Not Matching — other sections suppressed**" : `**AI Interview Questions**\n${(effectiveQuestions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join("\n")}

**Strengths**
${effectiveStrengths.map((s) => `* ${s}`).join("\n")}

**Areas for Improvement**
${effectiveWeaknesses.map((w) => `* ${w}`).join("\n")}

**Identified Gaps (vs JD)**
${effectiveGaps.map((g) => `* ${g}`).join("\n")}

**Mentoring Needs**
${effectiveMentoring.map((m) => `* ${m}`).join("\n")}`}`;

            candidates.push({
              id: crypto.randomUUID(),
              name:
                profile?.name ||
                f.name.replace(/\.(pdf|docx|doc|txt)$/i, ""),
              email: profile?.email || contacts.email || "",
              phone: profile?.phone || contacts.phone || "",
              location: profile?.location || contacts.location || "",
              title: profile?.headline || profile?.experience?.[0]?.title || "",
              yearsExperience: years,
              education: eduLabel || eduStr || "",
              skills: mergedSkills,
              summary:
                profile?.summary || text.slice(0, 500).replace(/\s+/g, " "),
              matchScore,
              skillsEvidencePct,
              strengths: effectiveStrengths,
              weaknesses: effectiveWeaknesses,
              gaps: effectiveGaps,
              mentoringNeeds: effectiveMentoring,
              questions: effectiveQuestions,
              domainMismatch,
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
