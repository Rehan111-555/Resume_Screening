import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

// Robust HTML → text without any dependency.
// Strips scripts/styles/tags, collapses whitespace, decodes a few entities.
function htmlToPlainText(html: string): string {
  const withoutStyle = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutScript = withoutStyle.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutTags = withoutScript
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r?\n[ \t]*/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function fileToText(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const txt = decoder.decode(buf);

  // Light-weight check if the file looks like HTML; if so, sanitize it.
  const head = txt.slice(0, 2048);
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(head);
  return looksHtml ? htmlToPlainText(txt) : txt;
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
  const text = resumeText.toLowerCase();
  const must = jdKeywords.must || [];
  if (must.length === 0) return false;
  const found = must.some((k) =>
    [k.name, ...(k.synonyms || [])].some((s) => text.includes(String(s).toLowerCase()))
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

    const jdRaw = String(form.get("jobRequirements") || "");
    if (!jdRaw) {
      return NextResponse.json({ error: "jobRequirements missing" }, { status: 400 });
    }

    const jobRequirements: JobRequirements = JSON.parse(jdRaw);
    const jdText = `${jobRequirements.title || ""}\n${jobRequirements.description || ""}`;

    const jdKeywords = await llmDeriveKeywords(jdText);

    const files = form.getAll("resumes").filter(Boolean) as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No resumes uploaded." }, { status: 400 });
    }

    const outCandidates: Candidate[] = [];

    for (const resumeFile of files) {
      const resumeText = await fileToText(resumeFile);

      const profile = (await llmExtractProfile(resumeText)) || {};

      const c = baseCandidate(hashId());
      c.name = profile.name || "";
      c.email = profile.email || "";
      c.phone = profile.phone || "";
      c.location = profile.location || "";
      c.title = profile.headline || profile.title || "";
      c.summary = profile.summary || "";

      const skills = cleanTokens([
        ...(profile.skills || []),
        ...(profile.tools || []),
        ...(profile.industryDomains || []),
      ]);
      c.skills = skills;

      const eduIn = Array.isArray(profile.education) ? profile.education : [];
      const bestEdu = eduIn.find((e: any) => e?.degree) || eduIn[0] || { degree: "" };
      c.education = mapEduLevel(bestEdu?.degree || "") || "";

      const y = Number(profile.yearsExperience) || estimateYears(resumeText) || 0;
      c.yearsExperience = Math.max(0, Math.min(40, Math.round(y)));

      c.domainMismatch = isDomainMismatch(jdKeywords, resumeText);

      const heuristic = scoreHeuristically(resumeText, jdKeywords);
      c.skillsEvidencePct = Math.round(heuristic.coverage * 100);

      const eduReq = jobRequirements.educationLevel || "";
      const eduScore = eduFit(eduReq, c.education); // 0..1

      const minYears = Number(jobRequirements.minYearsExperience || 0);
      let yrsScore = 1;
      if (minYears > 0) {
        yrsScore = clamp01(c.yearsExperience / (minYears * 1.0));
        yrsScore = 0.5 + 0.5 * yrsScore;
      }

      const overall =
        0.6 * (c.skillsEvidencePct / 100) + 0.25 * yrsScore + 0.15 * eduScore;
      c.matchScore = Math.round(clamp01(overall) * 100);

      c.gaps = (heuristic.missing || []).slice(0, 6);
      c.strengths = (heuristic.matched || []).slice(0, 6);
      c.weaknesses = [];

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
