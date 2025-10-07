import { NextResponse } from "next/server";
import type { AnalysisResult, Candidate, JobRequirements } from "@/types";

import {
  estimateYears,
  domainSimilarity,
  llmDeriveKeywords,
  scoreHeuristically,
  llmExtractProfile,
  llmGradeCandidate,
  mapEduLevel,
  clamp01,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";

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
    yearsScore: 0,
    eduScore: 0,
    domainMismatch: false,

    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],

    matchedSkills: [],
    missingSkills: [],
    questions: [],
    educationSummary: "",
    formatted: "",
  };
}

// Safely flatten JD to plain text (tolerant fields)
function jdToText(jd: Partial<JobRequirements> | null | undefined): string {
  if (!jd) return "";
  const roleLike =
    (jd as any).role ?? (jd as any).title ?? (jd as any).position ?? "";

  return [
    roleLike,
    (jd as any).description ?? "",
    Array.isArray((jd as any).requiredSkills)
      ? (jd as any).requiredSkills.join(" ")
      : "",
    Array.isArray((jd as any).niceToHave)
      ? (jd as any).niceToHave.join(" ")
      : "",
    (jd as any).education ?? "",
    (jd as any).domain ?? "",
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const jdRaw = form.get("jobRequirements") as string | null;
    const jd: JobRequirements | null = jdRaw ? JSON.parse(jdRaw) : null;
    const jdText = jdToText(jd);

    // derive keywords once per request
    const kw = await llmDeriveKeywords(jdText);

    const files = form.getAll("resumes") as File[];
    const outCandidates: Candidate[] = [];

    for (const f of files) {
      const id = `${f.name}-${f.size}-${f.type}`;
      const cand = baseCandidate(id);

      // Read as text (works for txt/docx exports and sometimes PDFs; if garbage, LLM still tries)
      let text = "";
      try {
        text = await f.text();
      } catch {
        text = "";
      }

      // LLM profile extraction
      let profile: any = {};
      try {
        profile = await llmExtractProfile(text);
      } catch {
        profile = {};
      }

      cand.name = profile.name || "";
      cand.email = profile.email || "";
      cand.phone = profile.phone || "";
      cand.location = profile.location || "";
      cand.title = profile.headline || "";
      cand.summary = profile.summary || "";
      cand.skills = Array.isArray(profile.skills) ? profile.skills : [];
      cand.education =
        (profile.education?.[0]?.degree
          ? mapEduLevel(profile.education[0].degree)
          : "") || "";

      // Experience estimation (blend explicit + heuristic)
      const yearsFromText = estimateYears(text);
      const yearsLLM = Number(profile.yearsExperience || 0);
      const yrs =
        yearsLLM && yearsFromText
          ? Math.round((yearsLLM + yearsFromText) / 2)
          : yearsLLM || yearsFromText || 0;
      cand.yearsExperience = Math.max(0, Math.min(40, yrs));

      // Heuristic must/nice matching
      const h = scoreHeuristically(text, kw);
      cand.skillsEvidencePct = Math.round(h.coverage * 100);

      // Domain similarity
      const sim = domainSimilarity(jdText, text);
      cand.domainMismatch = sim < 0.15; // low similarity => mismatch

      // Education score (rough)
      const eduReq = (jd?.education || "").toLowerCase();
      const eduHave = cand.education.toLowerCase();
      let eduScore = 0.7;
      if (eduReq) {
        if (eduReq.includes("phd")) eduScore = eduHave.includes("phd") ? 1 : 0.6;
        else if (eduReq.includes("master"))
          eduScore = /phd|master/.test(eduHave)
            ? 1
            : eduHave.includes("bachelor")
            ? 0.7
            : 0.4;
        else if (eduReq.includes("bachelor"))
          eduScore = /phd|master|bachelor/.test(eduHave) ? 1 : 0.5;
      }
      cand.eduScore = eduScore;

      // Years score (rough)
      const wantYearsMatch =
        /\b(\d+)\s*\+?\s*years?\b/i.exec(jdText || "")?.[1] ?? null;
      const wantYears = wantYearsMatch ? parseInt(wantYearsMatch, 10) : 0;
      const yrScore = wantYears
        ? clamp01(cand.yearsExperience / wantYears)
        : clamp01(cand.yearsExperience / 5);
      cand.yearsScore = yrScore;

      // Lightweight score blend
      const baseScore =
        0.55 * h.coverage + 0.2 * yrScore + 0.15 * eduScore + 0.1 * sim;
      cand.matchScore = Math.round(baseScore * 100);

      // LLM grade (adds strengths/weaknesses/questions)
      try {
        const grade = await llmGradeCandidate(jdText, text);
        cand.strengths = grade.strengths || [];
        cand.weaknesses = grade.weaknesses || [];
        cand.questions = grade.questions || [];
        cand.matchedSkills = grade.matchedSkills || [];
        cand.missingSkills = grade.missingSkills || [];
        cand.educationSummary = grade.educationSummary || "";
      } catch {
        /* ignore */
      }

      // Nice formatted snippet for copy (compact)
      cand.formatted = [
        cand.name && `Name: ${cand.name}`,
        cand.email && `Email: ${cand.email}`,
        cand.phone && `Phone: ${cand.phone}`,
        cand.location && `Location: ${cand.location}`,
        cand.title && `Headline: ${cand.title}`,
        `Experience: ${cand.yearsExperience} years`,
        cand.education && `Education: ${cand.education}`,
        cand.skills?.length ? `Skills: ${cand.skills.slice(0, 15).join(", ")}` : "",
        `Match: ${cand.matchScore}%  | Skills & Evidence: ${cand.skillsEvidencePct}%`,
      ]
        .filter(Boolean)
        .join("\n");

      outCandidates.push(cand);
    }

    // Sort by match desc
    outCandidates.sort((a, b) => b.matchScore - a.matchScore);

    const payload: AnalysisResult = { candidates: outCandidates, jdText };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze resumes." },
      { status: 500 }
    );
  }
}
