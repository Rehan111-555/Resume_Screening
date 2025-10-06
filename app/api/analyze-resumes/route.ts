// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  mapEduLevel,
  eduFit,
  clamp01,
  estimateYears,
  type JDKeywords,
} from "@/utils/geminiClient.server";

import type { AnalysisResult, Candidate, JobRequirements } from "@/types";

/** ───────────── Helpers to read text from uploaded files ───────────── */

async function fileToText(f: File): Promise<string> {
  const type = (f.type || "").toLowerCase();
  const buf = Buffer.from(await f.arrayBuffer());

  // PDF
  if (type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf")) {
    const out = await pdfParse(buf);
    return (out.text || "").trim();
  }

  // DOCX
  if (
    type.includes("officedocument.wordprocessingml.document") ||
    f.name.toLowerCase().endsWith(".docx")
  ) {
    const out = await mammoth.extractRawText({ buffer: buf });
    return (out.value || "").trim();
  }

  // HTML
  if (type.includes("html") || f.name.toLowerCase().endsWith(".html")) {
    const html = buf.toString("utf8");
    return convert(html, { selectors: [{ selector: "a", options: { ignoreHref: true } }] }).trim();
  }

  // Plain text as fallback
  return buf.toString("utf8");
}

function baseCandidate(id: string): Candidate {
  return {
    id,
    name: "",
    email: "",
    phone: "",
    location: "",
    title: "",
    summary: "",
    skills: [],
    education: "",
    yearsExperience: 0,

    // list card scoring
    matchScore: 0,
    skillsEvidencePct: 0,
    yearsScore: 0,  // <- required in Candidate
    eduScore: 0,    // <- required in Candidate

    // flags
    domainMismatch: false,

    // optional detail fields (can stay empty if domain mismatched)
    formatted: "",
    questions: [],
    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],
    matchedSkills: [],
    missingSkills: [],
    educationSummary: "",
  };
}

/** ───────────── Domain-mismatch gating ─────────────
 * If the resume clearly does not match the JD domain,
 * we zero the scores and keep details empty.
 */
function isDomainMismatch(jdKw: JDKeywords, resumeSkills: string[], heurCoverage: number, rubricDomainScore: number | undefined) {
  // Heuristic + rubric check:
  // - very low heuristic coverage, AND
  // - rubric thinks domain knowledge is very low too
  const lowHeur = heurCoverage < 0.12; // pretty conservative threshold
  const lowRubric = rubricDomainScore !== undefined ? rubricDomainScore < 0.2 : false;
  return lowHeur && lowRubric;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jdJson = form.get("jobRequirements");
    if (!jdJson || typeof jdJson !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements" }, { status: 400 });
    }
    const jd: JobRequirements = JSON.parse(jdJson);

    const files: File[] = [];
    for (const value of form.values()) {
      if (value instanceof File) files.push(value);
    }
    if (!files.length) {
      return NextResponse.json({ error: "No resumes uploaded" }, { status: 400 });
    }

    // Derive JD keywords once
    const keywords = await llmDeriveKeywords(jd.description || "");

    const outCandidates: Candidate[] = [];

    for (const file of files) {
      const id = crypto.randomUUID();
      const candidate = baseCandidate(id);

      const text = await fileToText(file);

      // 1) LLM profile extraction (clean parse of resume)
      const profile = await llmExtractProfile(text);

      // fill basics if present
      candidate.name = (profile.name || "").toString();
      candidate.email = (profile.email || "").toString();
      candidate.phone = (profile.phone || "").toString();
      candidate.location = (profile.location || "").toString();
      candidate.title = (profile.headline || profile.title || "").toString();
      candidate.summary = (profile.summary || "").toString();
      candidate.skills = Array.isArray(profile.skills) ? profile.skills.map((s: any) => String(s || "")) : [];
      candidate.education = (profile.educationSummary || profile.education?.map?.((e: any) => e?.degree)?.join(", ") || "").toString();

      // years: trust profile first, else estimate heuristically from resume text
      const yearsFromProfile = Number(profile.yearsExperience || 0);
      const yearsHeur = estimateYears(text);
      candidate.yearsExperience = Number.isFinite(yearsFromProfile) && yearsFromProfile > 0 ? yearsFromProfile : yearsHeur;

      // 2) Heuristic keyword coverage
      const heur = scoreHeuristically(text, keywords);
      candidate.skillsEvidencePct = Math.round(100 * clamp01(heur.coverage));

      // 3) Rubric grading (deterministic)
      const rubric = await llmGradeCandidate(jd.description || "", text);

      // domain mismatch check
      const domainMismatch = isDomainMismatch(
        keywords,
        candidate.skills,
        heur.coverage,
        rubric?.breakdown?.domainKnowledge
      );
      candidate.domainMismatch = domainMismatch;

      // 4) Scores
      // yearsScore vs JD min
      const needYears = Number(jd.minYearsExperience || 0);
      const yearsRatio = needYears > 0 ? clamp01(candidate.yearsExperience / needYears) : 1;
      candidate.yearsScore = Math.round(100 * yearsRatio);

      // eduScore vs JD level
      const requiredEdu = mapEduLevel(jd.educationLevel || "");
      const haveEdu = mapEduLevel(candidate.education || rubric?.educationSummary || "");
      candidate.eduScore = Math.round(100 * clamp01(eduFit(requiredEdu, haveEdu)));

      // overall score (blend rubric + heuristic)
      const rubricScore = clamp01(Number(rubric?.score || 0) / 100);
      const blend = clamp01(0.65 * rubricScore + 0.35 * heur.coverage);
      candidate.matchScore = domainMismatch ? 0 : Math.round(100 * blend);

      // 5) Detail info (only if not domain mismatch)
      if (!domainMismatch) {
        candidate.questions = Array.isArray(rubric?.questions) ? rubric.questions.slice(0, 8) : [];
        candidate.strengths = Array.isArray(rubric?.strengths) ? rubric.strengths : [];
        candidate.weaknesses = Array.isArray(rubric?.weaknesses) ? rubric.weaknesses : [];
        candidate.matchedSkills = Array.isArray(rubric?.matchedSkills) ? rubric.matchedSkills : [];
        candidate.missingSkills = Array.isArray(rubric?.missingSkills) ? rubric.missingSkills : [];
        candidate.educationSummary = (rubric?.educationSummary || haveEdu || "").toString();

        // identified gaps: prefer heuristic "must" missing + rubric missingSkills
        const mustMissing = heur.missing || [];
        const rubricMissing = Array.isArray(rubric?.missingSkills) ? rubric.missingSkills : [];
        const gaps = new Set<string>([...mustMissing, ...rubricMissing].map((s) => String(s || "")));
        candidate.gaps = Array.from(gaps);
      } else {
        // ensure empties when mismatched
        candidate.questions = [];
        candidate.strengths = [];
        candidate.weaknesses = [];
        candidate.matchedSkills = [];
        candidate.missingSkills = [];
        candidate.gaps = [];
        candidate.educationSummary = haveEdu || "";
      }

      // formatted text for the Copy button in detail modal (optional)
      candidate.formatted = [
        `## Candidate Details — **${candidate.name || file.name}**`,
        ``,
        `**Personal Information**`,
        `* Email: ${candidate.email || "Not specified"}`,
        `* Phone: ${candidate.phone || "Not specified"}`,
        `* Location: ${candidate.location || "Not specified"}`,
        ``,
        `**Professional Summary**`,
        candidate.summary || "—",
        ``,
        `**Match Breakdown**`,
        `* **Overall Match:** ${candidate.matchScore}%`,
        `* **Experience:** ${candidate.yearsExperience ? `${candidate.yearsExperience} year${candidate.yearsExperience > 1 ? "s" : ""}` : "—"}`,
        `* **Skills & Evidence:** ${candidate.skillsEvidencePct}%`,
        `* **Education:** ${haveEdu || "—"}`,
      ].join("\n");

      outCandidates.push(candidate);
    }

    const payload: AnalysisResult = { jd, candidates: outCandidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Failed to analyze" }, { status: 500 });
  }
}
