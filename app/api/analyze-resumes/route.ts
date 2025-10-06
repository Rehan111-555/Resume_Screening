import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  estimateYears,
  domainSimilarity,
  mapEduLevel,
  eduFit,
  clamp01,
  cleanTokens,
} from "@/utils/geminiClient.server";

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
  // scores
  matchScore: number;
  skillsEvidencePct: number;
  yearsScore: number;
  eduScore: number;
  domainMismatch: boolean;
  // narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  // optional detail
  formatted?: string;
  questions?: string[];
};

type AnalysisResult = {
  candidates: Candidate[];
};

function id() {
  return crypto.randomBytes(6).toString("hex");
}

export const runtime = "nodejs";

/** Parse a buffer as best as possible (pdf/docx/html/txt already handled up-stream) */
async function readTextFromFile(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());

  // Try pure text first
  const ascii = buf.toString("utf8");
  // quick html sniff
  if (/<\w+[^>]*>/.test(ascii)) {
    return convert(ascii, { selectors: [{ selector: "a", options: { ignoreHref: true } }] });
  }
  return ascii;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jdJson = String(form.get("jobRequirements") || "{}");
    const jd = JSON.parse(jdJson) as { title: string; description: string; minYearsExperience?: number; educationLevel?: string };
    const jdText = `${jd.title || ""}\n${jd.description || ""}`;

    const files = form.getAll("resumes").filter(Boolean) as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No resumes uploaded" }, { status: 400 });
    }

    const jdKw = await llmDeriveKeywords(jdText);

    const outCandidates: Candidate[] = [];
    for (const file of files) {
      const rawText = await readTextFromFile(file);

      // LLM profile (robust, then fallback locally)
      const prof = await llmExtractProfile(rawText);
      const skillList = cleanTokens([...(prof?.skills || []), ...(prof?.tools || [])]);
      const summary = String(prof?.summary || "").trim();
      const title = String(prof?.headline || prof?.title || "").trim();
      const name = String(prof?.name || "").trim();

      const yearsFromResume = Number(prof?.yearsExperience || 0);
      const estYears = estimateYears(rawText);
      const yearsExperience = yearsFromResume > 0 ? yearsFromResume : estYears;

      const eduStr = mapEduLevel(
        String(prof?.education?.[0]?.degree || prof?.education?.[0]?.field || prof?.educationSummary || "")
      );

      // heuristic coverage score
      const cov = scoreHeuristically(rawText, jdKw);
      const skillsEvidencePct = Math.round(clamp01(cov.coverage) * 100);

      // years score vs JD min (if provided)
      const minYears = Number(jd?.minYearsExperience || 0);
      const yearsScore = minYears ? clamp01(yearsExperience / Math.max(1, minYears)) : clamp01(yearsExperience / 8);
      // edu
      const eduScore = eduFit(jd?.educationLevel, eduStr);

      // domain similarity
      const sim = domainSimilarity(jdText, rawText); // 0..1
      const domainMismatch = sim < 0.12; // conservative threshold

      // blend (skills 55%, years 25%, edu 10%, domain 10%)
      const matchScore = Math.round(
        100 * (0.55 * clamp01(cov.coverage) + 0.25 * yearsScore + 0.10 * eduScore + 0.10 * (domainMismatch ? 0 : sim))
      );

      const c: Candidate = {
        id: id(),
        name,
        email: String(prof?.email || ""),
        phone: String(prof?.phone || ""),
        location: String(prof?.location || ""),
        title,
        yearsExperience,
        education: eduStr,
        skills: skillList,
        summary,
        matchScore,
        skillsEvidencePct,
        yearsScore,
        eduScore,
        domainMismatch,
        strengths: Array.isArray(prof?.strengths) ? prof.strengths : [],
        weaknesses: Array.isArray(prof?.weaknesses) ? prof.weaknesses : [],
        gaps: Array.isArray(prof?.gaps) ? prof.gaps : [],
        mentoringNeeds: Array.isArray(prof?.mentoringNeeds) ? prof.mentoringNeeds : [],
        questions: Array.isArray(prof?.questions) ? prof.questions : [],
        formatted: "", // filled in UI copy button
      };

      outCandidates.push(c);
    }

    // Sort best first
    outCandidates.sort((a, b) => b.matchScore - a.matchScore);

    const payload: AnalysisResult = { candidates: outCandidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Failed to analyze" }, { status: 500 });
  }
}
