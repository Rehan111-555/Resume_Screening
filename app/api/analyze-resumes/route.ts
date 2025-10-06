/* app/api/analyze-resumes/route.ts */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mammoth from "mammoth"; // docx → text (present in your package.json)
import type { Candidate, AnalysisResult, JobRequirements } from "@/types";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  type JDKeywords,
  mapEduLevel,
  eduFit,
  clamp01,
} from "@/utils/geminiClient.server";

/** ───────────────────────── Helpers ───────────────────────── */

function stripHtml(input: string): string {
  return (input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Robust timeline/“X years” estimator (fallback)
function estimateYears(text: string): number {
  const t = (text || "").replace(/\s+/g, " ").toLowerCase();
  let months = 0;

  // “Jan 2020 - Mar 2024”, “2019–present”, etc.
  const period =
    /\b(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*)?(\d{4})\s*(?:-|–|—|to)\s*(?:present|current|now|(?:(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*)?(\d{4})))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = period.exec(t))) {
    const y1 = parseInt(m[2], 10);
    const y2 = m[4] ? parseInt(m[4], 10) : new Date().getFullYear();
    if (y1 >= 1980 && y1 <= y2 && y2 <= new Date().getFullYear() + 1) {
      months += (y2 - y1) * 12;
    }
  }

  // “X years of experience”
  const single = /\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i.exec(t);
  if (single && months === 0) return Math.min(40, parseFloat(single[1]));

  return Math.min(40, Math.round(months / 12));
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\+\.\-#& ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function toSet(xs: string[]): Set<string> {
  const set = new Set<string>();
  for (const x of xs) set.add(x.trim().toLowerCase());
  return set;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let c = 0;
  for (const x of a) if (b.has(x)) c++;
  return c;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

async function parseBufferAsText(name: string, buf: Buffer): Promise<string> {
  const lower = (name || "").toLowerCase();

  // DOCX
  if (lower.endsWith(".docx")) {
    try {
      const res = await mammoth.extractRawText({ buffer: buf });
      return stripHtml(res.value || "");
    } catch {
      // continue to fallback
    }
  }

  // PDF (optional—use dynamic import to avoid hard build fails if missing)
  if (lower.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = (await import("pdf-parse")).default as any;
      const data = await pdfParse(buf);
      return stripHtml(data.text || "");
    } catch {
      // continue to fallback
    }
  }

  // Plain text / unknown
  return stripHtml(buf.toString("utf8"));
}

function buildResumeTokenSet(profile: any, rawText: string): Set<string> {
  const buckets: string[] = [];

  if (Array.isArray(profile?.skills)) buckets.push(...profile.skills);
  if (Array.isArray(profile?.tools)) buckets.push(...profile.tools);
  if (Array.isArray(profile?.industryDomains)) buckets.push(...profile.industryDomains);

  if (Array.isArray(profile?.experience)) {
    for (const e of profile.experience) {
      if (Array.isArray(e?.tech)) buckets.push(...e.tech);
      if (Array.isArray(e?.achievements)) buckets.push(...e.achievements);
      if (e?.title) buckets.push(e.title);
      if (e?.company) buckets.push(e.company);
    }
  }

  // Add some raw text fallback tokens (helps when profile misses items)
  const rawTokens = tokenize(rawText).slice(0, 600); // cap to avoid bloat
  buckets.push(...rawTokens);

  // normalize and keep non-trivial tokens
  const cleaned = buckets
    .map(String)
    .map((x) => x.toLowerCase().trim())
    .filter((x) => x.length >= 3);

  return toSet(cleaned);
}

function buildJDTokenSet(jd: string, kw: JDKeywords): Set<string> {
  const buckets: string[] = [];

  for (const k of kw.must || []) {
    buckets.push(k.name || "");
    (k.synonyms || []).forEach((s) => buckets.push(s || ""));
  }
  for (const k of kw.nice || []) {
    buckets.push(k.name || "");
    (k.synonyms || []).forEach((s) => buckets.push(s || ""));
  }

  // also add JD raw tokens
  buckets.push(...tokenize(jd));

  const cleaned = buckets
    .map((x) => x.toLowerCase().trim())
    .filter((x) => x.length >= 3);

  return toSet(cleaned);
}

function decideDomainMismatch(jdSet: Set<string>, resumeSet: Set<string>, rawJD: string, rawResume: string): boolean {
  // primary: intersection
  if (overlapCount(jdSet, resumeSet) >= 2) return false; // good overlap

  // secondary: fuzzy tries (very light) – if any JD token occurs in resume text
  const jdTokens = Array.from(jdSet).slice(0, 40); // limit for performance
  const T = " " + (rawResume || "").toLowerCase() + " ";

  for (const jt of jdTokens) {
    if (jt.length < 4) continue;
    if (T.includes(" " + jt + " ") || T.includes(jt)) return false;
  }

  // guard: if JD is too generic/short, don’t penalize
  const jdLen = (rawJD || "").split(/\s+/).length;
  if (jdLen < 30) return false;

  // default: mismatch only when we’re pretty sure there’s no overlap
  return true;
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
  };
}

/** ───────────────────────── Route ───────────────────────── */

export const runtime = "nodejs"; // make sure we’re on the Node runtime for Buffer

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jdRaw = String(form.get("jobRequirements") || "{}");
    const job: JobRequirements = JSON.parse(jdRaw);

    const resumes: File[] = [];
    form.forEach((v, k) => {
      if (k === "resumes" && v instanceof File) resumes.push(v);
    });
    if (!resumes.length) {
      return NextResponse.json(
        { error: "No resumes found in the request." },
        { status: 400 }
      );
    }

    // Derive JD keywords once
    const jdText = `${job.title || ""}\n${job.description || ""}\n${job.educationLevel || ""}`;
    const jdKw = await llmDeriveKeywords(jdText);
    const jdSet = buildJDTokenSet(jdText, jdKw);

    const outCandidates: Candidate[] = [];

    for (const file of resumes) {
      const ab = await file.arrayBuffer();
      const buf = Buffer.from(ab);
      const text = await parseBufferAsText(file.name || "upload", buf);

      const profile = await llmExtractProfile(text);

      const id = crypto.randomBytes(8).toString("hex");
      const cand = baseCandidate(id);

      // Fill personal/profile data (guarding optional fields)
      cand.name = profile?.name || "";
      cand.email = profile?.email || "";
      cand.phone = profile?.phone || "";
      cand.location = profile?.location || "";
      cand.title = profile?.headline || profile?.title || "";
      cand.summary = profile?.summary || "";
      cand.education = mapEduLevel(
        Array.isArray(profile?.education) && profile.education[0]?.degree
          ? profile.education[0].degree
          : profile?.educationSummary || ""
      );

      // Skills (dedup)
      const skills = uniq([
        ...(Array.isArray(profile?.skills) ? profile.skills : []),
        ...(Array.isArray(profile?.tools) ? profile.tools : []),
      ]).slice(0, 50);
      cand.skills = skills;

      // Experience years
      const profileYears = Number(profile?.yearsExperience || 0);
      const heuristicYears = estimateYears(text);
      cand.yearsExperience = Math.max(
        Number.isFinite(profileYears) ? profileYears : 0,
        heuristicYears
      );

      // Heuristic keyword coverage for scoring
      const heuristic = scoreHeuristically(text, jdKw);
      const coverage = clamp01(heuristic.coverage);
      cand.skillsEvidencePct = Math.round(coverage * 100);

      // Domain matching (forgiving)
      const resumeSet = buildResumeTokenSet(profile, text);
      const mismatch = decideDomainMismatch(jdSet, resumeSet, jdText, text);
      cand.domainMismatch = mismatch;

      // Education fit
      const eduScore = eduFit(job.educationLevel || "", cand.education || "");
      const yrsFit =
        job.minYearsExperience && job.minYearsExperience > 0
          ? clamp01(cand.yearsExperience / job.minYearsExperience)
          : 0.7;

      let score = 0;
      if (mismatch) {
        // If domain is not matching, clamp very low
        score = 8 + Math.round(coverage * 10); // 8–18%
      } else {
        // Blend coverage (skills evidence) + edu + yrs
        const blended =
          0.65 * coverage + 0.2 * clamp01(eduScore) + 0.15 * clamp01(yrsFit);
        score = Math.round(100 * clamp01(blended));
      }
      cand.matchScore = score;

      outCandidates.push(cand);
    }

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
