// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { convert } from "html-to-text";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import type { Candidate, AnalysisResult, JobRequirements } from "@/types";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  estimateYears,
  mapEduLevel,
  clamp01,
  domainSimilarity,
} from "@/utils/geminiClient.server";

async function fileToText(file: File): Promise<string> {
  const lower = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const out = await pdf(buf);
      return (out.text || "").trim();
    } catch (e) {
      return `PARSE_ERROR: pdf ${String(e)}`;
    }
  }

  if (lower.endsWith(".docx") || file.type.includes("officedocument.wordprocessingml.document")) {
    try {
      const out = await mammoth.extractRawText({ buffer: buf });
      return (out.value || "").trim();
    } catch (e) {
      return `PARSE_ERROR: docx ${String(e)}`;
    }
  }

  if (lower.endsWith(".html") || file.type.includes("text/html")) {
    try {
      return convert(buf.toString("utf8"), { wordwrap: false }).trim();
    } catch (e) {
      return `PARSE_ERROR: html ${String(e)}`;
    }
  }

  try {
    const asText = buf.toString("utf8");
    return asText.trim();
  } catch (e) {
    return `PARSE_ERROR: txt ${String(e)}`;
  }
}

function blankCandidate(id: string): Candidate {
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
    questions: [],
    educationSummary: "",
    formatted: "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jdRaw = form.get("jobRequirements") as string | null;
    if (!jdRaw) return NextResponse.json({ error: "Missing jobRequirements" }, { status: 400 });

    const jd: JobRequirements = JSON.parse(jdRaw);
    const files = form.getAll("resumes").filter(Boolean) as File[];
    if (files.length === 0) return NextResponse.json({ error: "No resumes uploaded" }, { status: 400 });

    const jdText = `${jd.title || ""}\n${jd.description || ""}`;
    const jdKeywords = await llmDeriveKeywords(jdText);

    const rawTexts = await Promise.all(files.map(fileToText));
    const candidates: Candidate[] = [];

    for (let i = 0; i < files.length; i++) {
      const id = `${i}-${files[i].name}`;
      const base = blankCandidate(id);
      const text = rawTexts[i] || "";

      if (!text || /^PARSE_ERROR:/i.test(text)) {
        base.summary = text || "PARSE_ERROR: empty";
        base.domainMismatch = true;
        base.skillsEvidencePct = 0;
        base.matchScore = 0;
        base.formatted = `Resume: ${files[i].name}\n\n${text}`;
        candidates.push(base);
        continue;
      }

      // Heuristic: JD coverage
      const heur = scoreHeuristically(text, jdKeywords);
      base.skillsEvidencePct = Math.round(heur.coverage * 100);

      // Domain similarity (semi-agnostic)
      const sim = domainSimilarity(jdText, text); // 0..1
      const domainMismatch = sim < 0.12 && heur.coverage < 0.22;
      base.domainMismatch = domainMismatch;

      // Basic signals
      const years = estimateYears(text);
      base.yearsExperience = years;
      base.education = mapEduLevel(text);

      // Extract details
      const profile = await llmExtractProfile(text);

      base.name = profile.name || base.name;
      base.email = profile.email || "";
      base.phone = profile.phone || "";
      base.location = profile.location || "";
      base.title = profile.headline || profile.title || "";
      base.summary = profile.summary || "";
      base.skills = Array.isArray(profile.skills) ? profile.skills : [];
      base.strengths = Array.isArray(profile.strengths) ? profile.strengths : [];
      base.weaknesses = Array.isArray(profile.weaknesses) ? profile.weaknesses : [];
      base.gaps = Array.isArray(profile.missingSkills) ? profile.missingSkills : [];
      base.questions = Array.isArray(profile.questions) ? profile.questions.slice(0, 8) : [];

      base.educationSummary = Array.isArray(profile.education)
        ? profile.education.map((e: any) => e.degree || e.institution).filter(Boolean).join(" · ")
        : "";

      // Score blend
      const yearsFit = clamp01(years / (jd.minYearsExperience || 4));
      const eduFit = jd.educationLevel
        ? (base.education.toLowerCase().includes(jd.educationLevel.toLowerCase()) ? 1 : 0.6)
        : 0.8;

      const rawScore = 0.55 * heur.coverage + 0.25 * yearsFit + 0.20 * eduFit;
      base.matchScore = Math.round(100 * clamp01(rawScore));

      base.formatted =
        `Name: ${base.name}\n` +
        `Email: ${base.email}\n` +
        `Phone: ${base.phone}\n` +
        `Location: ${base.location}\n` +
        `Title: ${base.title}\n` +
        `Experience: ${base.yearsExperience} years\n` +
        `Education: ${base.education}\n` +
        `Skills: ${base.skills.join(", ")}\n\n` +
        `Summary:\n${base.summary}`;

      candidates.push(base);
    }

    candidates.sort((a, b) => b.matchScore - a.matchScore);
    const payload: AnalysisResult = { candidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
