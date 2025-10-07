/* app/api/analyze-resumes/route.ts
   Parses the multipart form (jobRequirements + resumes[]),
   extracts light text from files, calls Gemini helpers,
   and returns { candidates } (NO `jd` key so it matches AnalysisResult).
*/

import { NextResponse } from "next/server";

import type {
  Candidate,
  AnalysisResult,
  JobRequirements,
} from "@/types";

import {
  llmExtractProfile,
  llmGradeCandidate,
  llmDeriveKeywords,
  scoreHeuristically,
  estimateYears,
  domainSimilarity,
  cleanTokens,
} from "@/lib/geminiClient.server";

// We need Node APIs (File#arrayBuffer etc. are fine in node runtime too)
export const runtime = "nodejs";

/** ───────────────────────── Utilities ───────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Try to read file as UTF-8 text. For binary (pdf/docx) we still read bytes
// and let the LLM cope with it as best as possible (passing raw text fallback).
async function fileToText(f: File): Promise<string> {
  // If it’s plain text or JSON, rely on native .text()
  if ((f.type || "").startsWith("text/") || f.type === "application/json") {
    try {
      return await f.text();
    } catch {
      /* fall through */
    }
  }

  // Otherwise read bytes and try a naive UTF-8 decode
  try {
    const buf = await f.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(new Uint8Array(buf));

    // Some PDFs/DOCX won’t decode nicely. Keep *something* so the
    // model at least has file name + small stub.
    if (text && /\S/.test(text)) {
      return text;
    }
  } catch {
    /* fall through */
  }

  // Fallback minimal stub
  return `Filename: ${f.name}\n(Unable to read binary content as text)`;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** Small scoring combiner so UI numbers look sane and consistent */
function combineMatchScore(opts: {
  heuristicCoverage: number; // 0..1
  domainSim: number;         // 0..1
  llmScore: number;          // 0..100
  years: number;
}): { overallPct: number; skillsPct: number } {
  const { heuristicCoverage, domainSim, llmScore, years } = opts;

  // Heuristic “skills & evidence” emphasizes coverage a bit more
  const skills = clamp01(0.7 * heuristicCoverage + 0.3 * domainSim);
  const skillsPct = Math.round(skills * 100);

  // Overall folds in the LLM score + a soft bonus for real years
  const yearsBoost = Math.min(0.1, years / 20); // up to +10%
  const overall =
    0.45 * skills + 0.45 * (llmScore / 100) + 0.10 * yearsBoost;

  const overallPct = Math.round(clamp01(overall) * 100);
  return { overallPct, skillsPct };
}

/** ───────────────────────── POST Handler ───────────────────────── */

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // (1) Job requirements block
    const jdString = form.get("jobRequirements");
    const job: JobRequirements = safeJson<JobRequirements>(String(jdString || ""), {
      title: "",
      description: "",
      educationPreference: "",
      minYears: 0,
    });

    const jdText =
      `${job.title || ""}\n\n${job.description || ""}\n\nEducation pref: ${
        job.educationPreference || ""
      }`.trim();

    // Derive JD keyword clusters (must/nice)
    const jdKeywords = await llmDeriveKeywords(jdText);

    // (2) All resume files
    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (key === "resumes" && value instanceof File) {
        files.push(value);
      }
    }

    if (!files.length) {
      return NextResponse.json(
        { error: "No resumes uploaded." },
        { status: 400 }
      );
    }

    const outCandidates: Candidate[] = [];

    // (3) Process each file → candidate
    for (const f of files) {
      const id = uid();
      const rawText = await fileToText(f);

      // LLM profile extraction (name, contact, summary, skills, edu, etc.)
      const profile = await llmExtractProfile(rawText);

      // Fallback years estimation if the profile doesn’t return one
      let yearsExp = Number(profile?.yearsExperience || 0);
      if (!Number.isFinite(yearsExp) || yearsExp <= 0) {
        yearsExp = estimateYears(rawText);
      }

      // Heuristic coverage vs JD
      const heur = scoreHeuristically(rawText, jdKeywords);

      // Domain similarity (0..1), where very low -> domain mismatch
      const sim = domainSimilarity(jdText, rawText);
      const domainMismatch = sim < 0.08; // adjustable

      // Secondary LLM grading (score + insights)
      const grade = await llmGradeCandidate(jdText, rawText);

      // Score blending for UI
      const blended = combineMatchScore({
        heuristicCoverage: heur.coverage,
        domainSim: sim,
        llmScore: Number(grade?.score || 0),
        years: yearsExp,
      });

      // Normalize skills list (remove junk words)
      const normSkills = cleanTokens(
        Array.isArray(profile?.skills) ? profile.skills : []
      );

      // Build a nice formatted paragraph the “Copy” button uses
      const formatted = [
        `Name: ${profile?.name || f.name}`,
        profile?.headline ? `Headline: ${profile.headline}` : "",
        profile?.email ? `Email: ${profile.email}` : "",
        profile?.phone ? `Phone: ${profile.phone}` : "",
        profile?.location ? `Location: ${profile.location}` : "",
        `Experience: ${yearsExp} ${yearsExp === 1 ? "year" : "years"}`,
        normSkills.length ? `Skills: ${normSkills.join(", ")}` : "",
        profile?.summary ? `Summary: ${profile.summary}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Assemble candidate – include fields your UI has required before
      const cand: Candidate = {
        id,
        name: String(profile?.name || f.name || "Unknown"),
        email: String(profile?.email || ""),
        phone: String(profile?.phone || ""),
        location: String(profile?.location || ""),
        title: String(profile?.headline || ""),
        yearsExperience: yearsExp,
        education: String(
          profile?.education?.[0]?.degree ||
            profile?.education?.[0]?.institution ||
            ""
        ),
        skills: normSkills,
        summary: String(profile?.summary || ""),
        matchScore: blended.overallPct,          // shown as XX% match
        skillsEvidencePct: blended.skillsPct,    // “Skills & Evidence”
        domainMismatch,
        strengths: Array.isArray(grade?.strengths) ? grade.strengths : [],
        weaknesses: Array.isArray(grade?.weaknesses) ? grade.weaknesses : [],
        gaps: Array.isArray(heur?.missing) ? heur.missing : [],
        mentoringNeeds: [],
        questions: Array.isArray(grade?.questions) ? grade.questions : [],
        educationSummary: String(grade?.educationSummary || ""),
        // UI “Copy as Text”
        formatted,
      };

      outCandidates.push(cand);
    }

    // (4) Sort by match score desc (default view feels nicer)
    outCandidates.sort((a, b) => b.matchScore - a.matchScore);

    // (5) IMPORTANT: return ONLY { candidates } so it matches AnalysisResult
    const payload: AnalysisResult = { candidates: outCandidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze resumes." },
      { status: 500 }
    );
  }
}
