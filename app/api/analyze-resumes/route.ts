import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// If you already have these helpers in your project, keep the imports.
// Otherwise, replace them with your own implementations.
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  estimateYears,
  mapEduLevel,
  eduFit,
  clamp01,
  cleanTokens,
  type JDKeywords,
} from "@/utils/geminiClient.server";

import type { Candidate, JobRequirements, AnalysisResult } from "@/types";

/* ───────────────────────────────── helpers ───────────────────────────────── */

async function fileToText(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const head = decoder.decode(buf.slice(0, 4096));
  const asText = decoder.decode(buf);

  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(head);

  // If not HTML-ish, just return decoded text
  if (!looksHtml) return asText;

  // Try to use html-to-text only if it exists. If not installed, use a simple fallback.
  try {
    const mod: any = await import("html-to-text"); // optional
    const { convert } = mod;
    return convert(asText, { wordwrap: false });
  } catch {
    // very naive HTML -> text fallback (good enough for plain extraction)
    return asText
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
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
    formatted: "",
    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],
  };
}

function isDomainMismatch(jdKeywords: JDKeywords, resumeText: string): boolean {
  // Domain check = if none of the "must" appear at all
  const text = resumeText.toLowerCase();
  const must = jdKeywords.must || [];
  if (must.length === 0) return false;

  const found = must.some((k) =>
    [k.name, ...(k.synonyms || [])].some((s) => text.includes(s.toLowerCase()))
  );
  return !found;
}

function hashId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/* ───────────────────────────────── route ───────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // Parse job requirements
    const jdRaw = String(form.get("jobRequirements") || "");
    if (!jdRaw) {
      return NextResponse.json(
        { error: "jobRequirements missing" },
        { status: 400 }
      );
    }

    const jobRequirements: JobRequirements = JSON.parse(jdRaw);
    const jdText = `${jobRequirements.title || ""}\n${jobRequirements.description || ""}`;

    // Derive JD keywords from description (role-agnostic, uses LLM with fallback)
    const jdKeywords = await llmDeriveKeywords(jdText);

    // Read all uploaded resumes
    const files = form.getAll("resumes").filter(Boolean) as File[];
    if (!files.length) {
      return NextResponse.json(
        { error: "No resumes uploaded." },
        { status: 400 }
      );
    }

    const outCandidates: Candidate[] = [];

    for (const resumeFile of files) {
      const resumeText = await fileToText(resumeFile);

      // Extract a structured profile from the resume text (LLM function)
      const profile = (await llmExtractProfile(resumeText)) || {};

      // Construct candidate object
      const c = baseCandidate(hashId());

      c.name = profile.name || "";
      c.email = profile.email || "";
      c.phone = profile.phone || "";
      c.location = profile.location || "";
      c.title = profile.headline || profile.title || "";
      c.summary = profile.summary || "";

      // skills & tools
      const allSkills = cleanTokens([
        ...(profile.skills || []),
        ...(profile.tools || []),
        ...(profile.industryDomains || []),
      ]);
      c.skills = allSkills;

      // education (simple top-most degree inferred)
      const eduIn = Array.isArray(profile.education) ? profile.education : [];
      const bestEdu =
        eduIn.find((e: any) => e?.degree) || eduIn[0] || { degree: "" };
      c.education = mapEduLevel(bestEdu?.degree || "") || "";

      // years — use profile.yearsExperience or fallback estimation
      const y =
        Number(profile.yearsExperience) ||
        estimateYears(resumeText) ||
        0;
      c.yearsExperience = Math.max(0, Math.min(40, Math.round(y)));

      // Domain mismatch?
      c.domainMismatch = isDomainMismatch(jdKeywords, resumeText);

      // Heuristic scoring (must/nice coverage)
      const heuristic = scoreHeuristically(resumeText, jdKeywords);
      const skillsEvidence = Math.round(heuristic.coverage * 100);
      c.skillsEvidencePct = skillsEvidence;

      // Education fit vs JD requirement
      const eduReq = jobRequirements.educationLevel || "";
      const eduScore = eduFit(eduReq, c.education); // 0..1

      // Years fit vs JD min
      const minYears = Number(jobRequirements.minYearsExperience || 0);
      let yrsScore = 1;
      if (minYears > 0) {
        yrsScore = clamp01(c.yearsExperience / (minYears * 1.0));
        yrsScore = 0.5 + 0.5 * yrsScore; // soften
      }

      // Overall match: 60% skills, 25% years, 15% education
      const overall =
        0.6 * (c.skillsEvidencePct / 100) + 0.25 * yrsScore + 0.15 * eduScore;
      c.matchScore = Math.round(clamp01(overall) * 100);

      // Gaps & strengths from heuristic
      c.gaps = (heuristic.missing || []).slice(0, 6);
      c.strengths = (heuristic.matched || []).slice(0, 6);
      c.weaknesses = []; // you can fill this from other signals if you want

      // formatted block for "Copy as text" button (keep null safe)
      c.formatted = [
        `## Candidate Details — **${c.name || "—"}**`,
        "",
        `**Personal Information**`,
        `* Email: ${c.email || "Not specified"}`,
        `* Phone: ${c.phone || "Not specified"}`,
        `* Location: ${c.location || "Not specified"}`,
        "",
        `**Professional Summary**`,
        `${c.summary || "—"}`,
        "",
        `**Match Breakdown**`,
        `* **Overall Match:** ${c.matchScore}%`,
        `* **Experience:** ${c.yearsExperience || 0} years`,
        `* **Skills & Evidence:** ${c.skillsEvidencePct}%`,
        `* **Education:** ${c.education || "—"}`,
        "",
        `**Skills**`,
        `${(c.skills || []).join(", ") || "—"}`,
      ].join("\n");

      outCandidates.push(c);
    }

    // Final payload
    const payload: AnalysisResult = {
      candidates: outCandidates,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze resumes." },
      { status: 500 }
    );
  }
}
