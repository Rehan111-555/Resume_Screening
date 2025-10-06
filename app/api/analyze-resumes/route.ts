import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

import {
  llmExtractProfile,
  llmDeriveKeywords,
  llmGradeCandidate,
  estimateYears,
  eduFit,
  mapEduLevel,
  clamp01,
  domainOverlap,
  skillsEvidencePctFromLists,
  cleanTokens,
  type JDKeywords,
} from "@/utils/geminiClient.server";

import type { Candidate, JobRequirements } from "@/types";

async function readFileToText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    const res = await pdfParse(buf);
    return res.text || "";
  }
  if (name.endsWith(".docx")) {
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value || "";
  }
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return convert(buf.toString("utf8"));
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".rtf")) {
    return buf.toString("utf8");
  }

  // fallback: try utf8
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
    yearsExperience: 0,
    education: "",
    skills: [],
    summary: "",
    matchScore: 0,
    skillsEvidencePct: 0,
    domainMismatch: false,
    questions: [],
    strengths: [],
    weaknesses: [],
    gaps: [],
  };
}

function computeMatch(
  jd: JobRequirements,
  jdKw: JDKeywords,
  resumeText: string,
  years: number,
  edu: string,
  rubricScore: number,
  heuristicCoverage: number
) {
  const { ratio: domainRatio } = domainOverlap(jdKw, resumeText);
  const eduScore = eduFit(jd.educationLevel, edu); // 0..1
  const yearsReq = jd.minYearsExperience || 0;
  const yearsScore = yearsReq ? clamp01(years / yearsReq) : 1; // 0..1
  const rubric = rubricScore / 100; // 0..1

  // If domain overlap is too low, treat as mismatch (return flag, score=0)
  const mismatch = domainRatio < 0.2;

  // Blend (weights can be tuned)
  const blended =
    0.40 * domainRatio +
    0.25 * heuristicCoverage +
    0.20 * rubric +
    0.10 * yearsScore +
    0.05 * eduScore;

  return {
    domainMismatch: mismatch,
    matchScore: mismatch ? 0 : Math.round(100 * clamp01(blended)),
  };
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const jdTitle = String(form.get("jdTitle") || "");
    const jdDescription = String(form.get("jdDescription") || "");
    const eduLevel = String(form.get("educationLevel") || "");
    const minYears = Number(form.get("minYearsExperience") || "0");

    const jd: JobRequirements = {
      title: jdTitle,
      description: jdDescription,
      educationLevel: eduLevel,
      minYearsExperience: isNaN(minYears) ? 0 : minYears,
    };

    // read files
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const texts: { id: string; name: string; text: string }[] = [];
    for (const f of files) {
      const text = await readFileToText(f);
      texts.push({
        id: crypto.randomUUID(),
        name: f.name,
        text,
      });
    }
    if (!texts.length) {
      return NextResponse.json({ candidates: [], jd }, { status: 200 });
    }

    // derive JD keywords once
    const jdKw = await llmDeriveKeywords(`${jd.title}\n\n${jd.description}`);

    const candidates: Candidate[] = [];
    for (const r of texts) {
      const cand = baseCandidate(r.id);

      // 1) Extract profile via LLM
      const prof = await llmExtractProfile(r.text);
      cand.name = String(prof.name || "");
      cand.email = String(prof.email || "");
      cand.phone = String(prof.phone || "");
      cand.location = String(prof.location || "");
      cand.title = String(prof.headline || prof.title || "");
      cand.summary = String(prof.summary || "");
      cand.skills = cleanTokens(Array.isArray(prof.skills) ? prof.skills : []);
      cand.education = mapEduLevel(
        Array.isArray(prof.education) && prof.education[0]?.degree
          ? prof.education[0].degree
          : String(prof.educationSummary || "")
      );

      // 2) Years (prefer structured, else heuristic)
      const yearsStructured = Number(prof.yearsExperience || 0);
      const yearsHeur = estimateYears(r.text);
      cand.yearsExperience =
        !isNaN(yearsStructured) && yearsStructured > 0
          ? yearsStructured
          : yearsHeur;

      // 3) Heuristic coverage & evidence %
      const { coverage } = await (async () => {
        const { scoreHeuristically } = await import(
          "@/utils/geminiClient.server"
        );
        return scoreHeuristically(r.text, jdKw);
      })();
      cand.skillsEvidencePct = skillsEvidencePctFromLists(r.text, jdKw);

      // 4) LLM rubric (only if not a domain mismatch later)
      let rubricScore = 0;
      let rubric: any = null;

      // compute preliminary domainRatio to decide mismatch
      const { ratio: preliminaryDomainRatio } = domainOverlap(jdKw, r.text);
      const isPreMismatch = preliminaryDomainRatio < 0.2;

      if (!isPreMismatch) {
        rubric = await llmGradeCandidate(`${jd.title}\n\n${jd.description}`, r.text);
        rubricScore = Number(rubric?.score || 0);
      }

      // 5) Final match & flags
      const { domainMismatch, matchScore } = computeMatch(
        jd,
        jdKw,
        r.text,
        cand.yearsExperience,
        cand.education,
        rubricScore,
        coverage
      );
      cand.domainMismatch = domainMismatch;
      cand.matchScore = matchScore;

      if (!domainMismatch && rubric) {
        cand.questions = Array.isArray(rubric.questions)
          ? rubric.questions.slice(0, 8)
          : [];
        cand.strengths = cleanTokens(
          Array.isArray(rubric.strengths) ? rubric.strengths : []
        ).slice(0, 10);
        cand.weaknesses = cleanTokens(
          Array.isArray(rubric.weaknesses) ? rubric.weaknesses : []
        ).slice(0, 10);

        // turn missingSkills into “gaps”, cleaned
        cand.gaps = cleanTokens(
          Array.isArray(rubric.missingSkills) ? rubric.missingSkills : []
        ).slice(0, 12);
      } else {
        // mismatched domain: keep it concise and neutral
        cand.questions = [];
        cand.strengths = [];
        cand.weaknesses = [];
        cand.gaps = [];
      }

      // Optional: a single blob to copy in modal
      cand.formatted = [
        `## Candidate Details — ${cand.name || r.name}`,
        ``,
        `**Personal Information**`,
        `- Email: ${cand.email || "Not specified"}`,
        `- Phone: ${cand.phone || "Not specified"}`,
        `- Location: ${cand.location || "Not specified"}`,
        ``,
        `**Professional Summary**`,
        cand.summary || "Not specified",
      ].join("\n");

      candidates.push(cand);
    }

    // sort by matchScore desc
    candidates.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({ candidates, jd }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
