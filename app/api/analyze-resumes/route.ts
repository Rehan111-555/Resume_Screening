// app/api/analyze-resumes/route.ts
import { NextResponse } from "next/server";
import type { Candidate, AnalysisResult } from "@/types";
import {
  estimateYears,
  domainSimilarity,
  cleanTokens,
  llmExtractProfile,
  llmGradeCandidate,
  mapEduLevel,
  clamp01,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";

/** Read a File -> string (no external deps). */
async function fileToText(f: File): Promise<string> {
  const buf = Buffer.from(await f.arrayBuffer());
  // Try UTF-8 first; PDFs will yield noisy text, but we keep things dependency-free.
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

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
    domainMismatch: false,
    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],
    educationSummary: "",
    questions: [],
    formatted: "",
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const jdRaw = form.get("jobRequirements");
    const jd = typeof jdRaw === "string" ? jdRaw : "";

    const files = form.getAll("resumes").filter((v): v is File => v instanceof File);
    if (!files.length) {
      return NextResponse.json({ candidates: [] satisfies Candidate[] } as AnalysisResult, { status: 200 });
    }

    const outCandidates: Candidate[] = [];

    for (const file of files) {
      const id = `${file.name}-${file.size}-${file.lastModified ?? Date.now()}`;
      const cand = baseCandidate(id);

      // 1) Extract raw text
      const text = await fileToText(file);

      // 2) Heuristics
      const years = estimateYears(text);
      cand.yearsExperience = years;

      // 3) Domain similarity -> flag mismatch
      const sim = domainSimilarity(jd, text); // 0..1
      cand.domainMismatch = sim < 0.2; // threshold; tweak as you like

      // 4) LLM enrichment (auto-fallback when API key missing)
      let profile: any = {};
      try {
        profile = await llmExtractProfile(text);
      } catch {
        profile = {};
      }

      cand.name = profile.name || cand.name;
      cand.email = profile.email || cand.email;
      cand.phone = profile.phone || cand.phone;
      cand.location = profile.location || cand.location;
      cand.title = profile.headline || cand.title;
      cand.summary = profile.summary || "";
      cand.skills = cleanTokens(profile.skills || []);
      cand.education = mapEduLevel(profile.education?.[0]?.degree || "") || "";

      // 5) Grade (LLM; safe fallback)
      let grade: any = {};
      try {
        grade = await llmGradeCandidate(jd, text);
      } catch {
        grade = {
          score: Math.round(clamp01(sim) * 100),
          strengths: [],
          weaknesses: [],
          yearsExperienceEstimate: cand.yearsExperience,
          educationSummary: "",
          matchedSkills: [],
          missingSkills: [],
          questions: [],
          breakdown: { jdAlignment: 0, impact: 0, toolsAndMethods: 0, domainKnowledge: 0, communication: 0 },
        };
      }

      cand.matchScore = Number.isFinite(grade.score) ? grade.score : Math.round(clamp01(sim) * 100);
      cand.skillsEvidencePct = Math.max(8, Math.min(95, Math.round((grade.matchedSkills?.length || 0) / 10 * 100))); // a safe display value
      cand.strengths = Array.isArray(grade.strengths) ? grade.strengths : [];
      cand.weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
      cand.educationSummary = grade.educationSummary || "";
      cand.questions = Array.isArray(grade.questions) ? grade.questions : [];

      // 6) Derived bits for the details modal "Copy as Text"
      cand.formatted =
        `Name: ${cand.name || "-"}\n` +
        `Email: ${cand.email || "-"}\n` +
        `Phone: ${cand.phone || "-"}\n` +
        `Location: ${cand.location || "-"}\n` +
        `Title: ${cand.title || "-"}\n\n` +
        `Summary:\n${cand.summary || "-"}\n\n` +
        `Skills: ${cand.skills.join(", ") || "-"}\n` +
        `Education: ${cand.education || "-"}\n` +
        `Experience (est): ${cand.yearsExperience} years\n`;

      outCandidates.push(cand);
    }

    const payload: AnalysisResult = { candidates: outCandidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Failed to analyze" }, { status: 500 });
  }
}
