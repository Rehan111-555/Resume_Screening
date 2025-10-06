import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  mapEduLevel,
  eduFit,
  clamp01,
  estimateYears,
  cleanTokens,
  type JDKeywords,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (active >= maxConcurrent) {
      await new Promise<void>((res) => queue.push(res));
    }
    active++;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse")).default;
    const res = await pdf(buf);
    return (res.text || "").trim();
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return (value || "").trim();
  }
  // fallback: try utf8
  return buf.toString("utf8");
}

import type { JobRequirements, Candidate, AnalysisResult } from "@/types";

function baseCandidate(id: string): Candidate {
  return {
    id,
    name: "",
    email: "",
    phone: "",
    location: "",
    title: "",
    yearsExperience: 0,
    education: "",
    skills: [],
    summary: "",
    matchScore: 0,
    skillsEvidencePct: 0,
    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],
    domainMismatch: false,
    // optional fields (UI guards with ?.)
    questions: [],
    formatted: "",
    matchedSkills: [],
    missingSkills: [],
    educationSummary: "",
  };
}

function buildFormatted(candidate: Candidate): string {
  const lines: string[] = [];
  lines.push(`## Candidate Details — **${candidate.name || "Unknown"}**`);
  lines.push("");
  lines.push(`**Personal Information**`);
  lines.push("");
  lines.push(`* Email: ${candidate.email || "—"}`);
  lines.push(`* Phone: ${candidate.phone || "—"}`);
  lines.push(`* Location: ${candidate.location || "—"}`);
  lines.push("");
  lines.push(`**Professional Summary**`);
  lines.push(`${candidate.summary || "—"}`);
  lines.push("");
  lines.push(`**Match Breakdown**`);
  lines.push("");
  lines.push(`* **Overall Match:** ${candidate.matchScore}%`);
  lines.push(`* **Experience:** ${candidate.yearsExperience || 0} years`);
  lines.push(`* **Skills & Evidence:** ${candidate.skillsEvidencePct}%`);
  lines.push(`* **Education:** ${candidate.education || "—"}`);
  lines.push("");
  lines.push(`**Skills**`);
  lines.push(`${candidate.skills.join(", ") || "—"}`);
  if (!candidate.domainMismatch && (candidate.questions?.length || 0) > 0) {
    lines.push("");
    lines.push(`**AI Interview Questions**`);
    candidate.questions!.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  lines.push("");
  lines.push(`**Strengths**`);
  candidate.strengths.forEach((s) => lines.push(`* ${s}`));
  lines.push("");
  lines.push(`**Areas for Improvement**`);
  candidate.weaknesses.forEach((w) => lines.push(`* ${w}`));
  lines.push("");
  lines.push(`**Identified Gaps (vs JD)**`);
  candidate.gaps.forEach((g) => lines.push(`* ${g}`));
  lines.push("");
  lines.push(`**Mentoring Needs**`);
  candidate.mentoringNeeds.forEach((m) => lines.push(`* ${m}`));
  return lines.join("\n");
}

function computeDomainMismatch(resumeText: string, kw: JDKeywords): boolean {
  // If MUST coverage is very low, treat as out-of-domain.
  // (We compute coverage later — but we can reuse heuristic directly here)
  const h = scoreHeuristically(resumeText, kw);
  return (kw.must?.length || 0) > 0 && h.coverage < 0.25;
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
    const JD = `${job.title || ""}\n\n${job.description || ""}`.trim();

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json(
        { error: "No resumes uploaded (field name must be 'resumes')." },
        { status: 400 }
      );
    }
    if (resumeFiles.length > 100) {
      return NextResponse.json({ error: "Limit 100 resumes per batch." }, { status: 400 });
    }

    // Derive JD keywords
    const jdKeywords = await llmDeriveKeywords(JD);

    const limit = createLimiter(8);
    const outCandidates: Candidate[] = [];
    const errors: { file: string; message: string }[] = [];

    await Promise.all(
      resumeFiles.map((file) =>
        limit(async () => {
          try {
            const id = crypto.randomUUID();
            const cand = baseCandidate(id);
            const text = await extractTextFromFile(file);

            // LLM profile (deterministic) + heuristic scoring
            const [profile, rubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            // Personal info
            cand.name =
              profile?.name ||
              file.name.replace(/\.(pdf|docx|doc|txt|rtf|html?)$/i, "");
            cand.email = profile?.email || "";
            cand.phone = profile?.phone || "";
            cand.location = profile?.location || "";
            cand.title = profile?.headline || profile?.experience?.[0]?.title || "";

            // Years of experience
            const yearsLLM = Number(rubric?.yearsExperienceEstimate || 0);
            const yearsHeu = estimateYears(text);
            const years = Number(Number(Math.max(yearsLLM, yearsHeu)).toFixed(2));
            cand.yearsExperience = Number.isFinite(years) ? years : 0;

            // Education
            const eduStr =
              (Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : "") || rubric?.educationSummary || "";
            const eduLabel = mapEduLevel(eduStr);
            cand.education = eduLabel || eduStr || "";

            // Skills (merged + cleaned)
            const merged = cleanTokens([
              ...((Array.isArray(profile?.skills) ? profile.skills : []) as string[]),
              ...((Array.isArray(rubric?.matchedSkills) ? rubric.matchedSkills : []) as string[]),
            ]);
            cand.skills = merged;

            // Summary
            cand.summary = profile?.summary || text.slice(0, 400).replace(/\s+/g, " ");

            // Heuristic evidence strict
            const h = scoreHeuristically(text, jdKeywords);
            cand.skillsEvidencePct = Math.round(h.coverage * 100);

            // Domain mismatch check
            const isOutOfDomain = computeDomainMismatch(text, jdKeywords);
            cand.domainMismatch = isOutOfDomain;

            // Scores
            const expFit = clamp01(
              job.minYearsExperience ? cand.yearsExperience / job.minYearsExperience : 1
            );
            const eduScore = eduFit(job.educationLevel, cand.education);
            const llmNorm = clamp01(Number(rubric?.score || 0) / 100);

            // Overall: if out of domain => 0; else blended
            const blended = 0.55 * h.coverage + 0.25 * expFit + 0.1 * eduScore + 0.1 * llmNorm;
            cand.matchScore = isOutOfDomain ? 0 : Math.round(100 * clamp01(blended));

            // Narrative (guarded)
            const strengths = Array.isArray(rubric?.strengths) ? rubric.strengths : [];
            const weaknesses = Array.isArray(rubric?.weaknesses) ? rubric.weaknesses : [];

            // Remove generic non-skill junk in gaps
            const missing = (Array.isArray(rubric?.missingSkills) ? rubric.missingSkills : h.missing) as string[];
            const cleanedMissing = cleanTokens(missing);

            cand.strengths = isOutOfDomain ? [] : strengths;
            cand.weaknesses = isOutOfDomain ? [] : weaknesses;
            cand.gaps = isOutOfDomain
              ? ["Domain not matching the JD"]
              : cleanedMissing.map((m) => `Skill gap: ${m}`);

            cand.mentoringNeeds = isOutOfDomain ? [] : cleanedMissing.slice(0, 3).map((m) => `Mentorship in ${m}`);

            cand.matchedSkills = h.matched;
            cand.missingSkills = cleanedMissing;
            cand.educationSummary = eduStr;

            // AI questions only if in-domain
            cand.questions = isOutOfDomain ? [] : (Array.isArray(rubric?.questions) ? rubric.questions : []);

            // Preformatted block for copy
            cand.formatted = buildFormatted(cand);

            outCandidates.push(cand);
          } catch (err: any) {
            errors.push({ file: file.name, message: String(err?.message || err) });
          }
        })
      )
    );

    // Sort by match score desc
    outCandidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const payload: AnalysisResult = {
      candidates: outCandidates,
      errors: errors.length ? errors : undefined,
      meta: { keywords: jdKeywords }
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
