/* app/api/analyze-resumes/route.ts */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mammoth from "mammoth";
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

/* ───────────────────────── Small utils ───────────────────────── */

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

const MONTHS = new Map<string, number>([
  ["jan", 0],["january", 0],
  ["feb", 1],["february", 1],
  ["mar", 2],["march", 2],
  ["apr", 3],["april", 3],
  ["may", 4],
  ["jun", 5],["june", 5],
  ["jul", 6],["july", 6],
  ["aug", 7],["august", 7],
  ["sep", 8],["september", 8],
  ["oct", 9],["october", 9],
  ["nov",10],["november",10],
  ["dec",11],["december",11],
]);

function ymToIndex(y:number,m:number){ return y*12+m; }
function indexToYM(k:number){ return {y:Math.floor(k/12), m:k%12}; }

/** Merge month ranges and return total months (deduped) */
function totalMonthsFromRanges(ranges: Array<{startYM:number,endYM:number}>): number {
  const seen = new Set<number>();
  for (const r of ranges) {
    const a = Math.min(r.startYM, r.endYM);
    const b = Math.max(r.startYM, r.endYM);
    for (let k=a; k<=b; k++) seen.add(k);
  }
  return seen.size;
}

/** Very robust years extractor: merges ranges and also handles “X yr Y mo”, “10+ years”, “since 2016”, “6 months” */
function robustYears(text: string): number {
  const t = (text || "").replace(/\s+/g, " ").toLowerCase();
  const now = new Date();
  const currYM = ymToIndex(now.getFullYear(), now.getMonth());
  const ranges: Array<{startYM:number,endYM:number}> = [];

  // Month Year — Month Year | Month Year — present | YYYY — YYYY | YYYY — present
  const dateRange =
    /\b(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(\d{4})\s*(?:-|–|—|to)\s*(?:present|current|now|(?:(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(\d{4})))\b/g;
  let m: RegExpExecArray | null;
  while ((m = dateRange.exec(t))) {
    const sm = m[1]; const sy = parseInt(m[2],10);
    const em = m[3]; const ey = m[3] ? parseInt(m[3],10) : NaN;
    const startMonth = sm && MONTHS.has(sm) ? MONTHS.get(sm)! : 0;
    const endMonth   = em && MONTHS.has(em) ? MONTHS.get(em)! : 11;
    const startYM = ymToIndex(sy, startMonth);
    const endYM   = isNaN(ey) ? currYM : ymToIndex(ey, endMonth);
    if (sy >= 1980 && startYM <= endYM) ranges.push({ startYM, endYM });
  }

  // "since 2016" / "since Jan 2019"
  const since =
    /\bsince\s+(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?(\d{4})\b/g;
  while ((m = since.exec(t))) {
    const sm = m[1]; const sy = parseInt(m[2],10);
    const startMonth = sm && MONTHS.has(sm) ? MONTHS.get(sm)! : 0;
    const startYM = ymToIndex(sy, startMonth);
    if (sy >= 1980 && startYM <= currYM) ranges.push({ startYM, endYM: currYM });
  }

  // "X yr Y mo" | "X years Y months" | "X+ years" | only months
  let numericMonths = 0;
  const yrMo = /\b(\d+)\s*(?:yr|yrs|year|years)\b(?:\s*(\d+)\s*(?:mo|mos|month|months)\b)?/g;
  while ((m = yrMo.exec(t))) {
    const y = parseInt(m[1],10);
    const mo = m[2] ? parseInt(m[2],10) : 0;
    if (y >= 0 && y <= 45 && mo >= 0 && mo <= 11) numericMonths = Math.max(numericMonths, y*12+mo);
  }
  const plusYears = /\b(\d+)\s*\+\s*years?\b/g;
  while ((m = plusYears.exec(t))) {
    const y = parseInt(m[1],10);
    numericMonths = Math.max(numericMonths, y*12);
  }
  const onlyMonths = /\b(\d+)\s*months?\b/g;
  while ((m = onlyMonths.exec(t))) {
    const mo = parseInt(m[1],10);
    if (mo <= 600) numericMonths = Math.max(numericMonths, mo);
  }

  const monthsFromRanges = totalMonthsFromRanges(ranges);
  const months = Math.max(monthsFromRanges, numericMonths);
  return Math.min(45, Math.round(months / 12));
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\+\.\-#& ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const BAD_SKILLS = new Set(
  [
    "problem solving","communication","teamwork","leadership","best","best practices","practices",
    "proactive","experience","strong","developer","development","customizing","shopify s",
  ].map((x)=>x.toLowerCase())
);

function cleanTokens(list: string[]): string[] {
  return Array.from(
    new Set(
      (list || [])
        .map((x) => String(x || "").trim().toLowerCase())
        .filter((x) => x.length > 2 && !BAD_SKILLS.has(x))
    )
  );
}

function toSet(xs: string[]): Set<string> {
  const s = new Set<string>();
  for (const x of xs) s.add(x.trim().toLowerCase());
  return s;
}
function overlapCount(a: Set<string>, b: Set<string>): number {
  let c = 0;
  for (const x of a) if (b.has(x)) c++;
  return c;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/** Build a token set representing the resume (profile fields + raw fallback) */
function buildResumeTokenSet(profile: any, raw: string): Set<string> {
  const pile: string[] = [];
  if (Array.isArray(profile?.skills)) pile.push(...profile.skills);
  if (Array.isArray(profile?.tools)) pile.push(...profile.tools);
  if (Array.isArray(profile?.industryDomains)) pile.push(...profile.industryDomains);
  if (Array.isArray(profile?.experience)) {
    for (const e of profile.experience) {
      if (Array.isArray(e?.tech)) pile.push(...e.tech);
      if (Array.isArray(e?.achievements)) pile.push(...e.achievements);
      if (e?.title) pile.push(e.title);
      if (e?.company) pile.push(e.company);
    }
  }
  if (profile?.headline) pile.push(profile.headline);
  if (profile?.summary) pile.push(profile.summary);
  // fallback: raw tokens too
  pile.push(...tokenize(raw));
  return toSet(cleanTokens(pile));
}

/** Domain decision: tolerant and not hardcoded */
function computeDomainMatch(kw: JDKeywords, resumeTokens: Set<string>): boolean {
  const must = toSet(kw.must.map(k => k.name));
  const nice = toSet(kw.nice.map(k => k.name));

  // Strong signal: any MUST present
  if (overlapCount(must, resumeTokens) >= 1) return true;

  // Moderate: at least 2 combined overlaps across must+nice
  const all = new Set<string>([...must, ...nice]);
  if (overlapCount(all, resumeTokens) >= 2) return true;

  // Soft: Jaccard on token sets
  const sim = jaccard(all, resumeTokens);
  return sim >= 0.03; // forgiving
}

/* ──────────────────────── File extraction ─────────────────────── */

async function extractFromPDF(buf: ArrayBuffer): Promise<string> {
  try {
    // Load only if installed; otherwise fall back to blank (no crash)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const pdfParse = (await import("pdf-parse")).default as any;
    const out = await pdfParse(Buffer.from(buf));
    const s = String(out?.text || "");
    return stripHtml(s);
  } catch {
    return "";
  }
}

async function extractTextFromFile(f: File): Promise<string> {
  const type = (f.type || "").toLowerCase();
  const buf = await f.arrayBuffer();

  if (type.includes("pdf")) {
    return await extractFromPDF(buf);
  }
  if (type.includes("word") || f.name.toLowerCase().endsWith(".docx")) {
    try {
      const out = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
      return stripHtml(out.value || "");
    } catch {
      return "";
    }
  }

  // plain text / html
  try {
    const s = await f.text();
    return stripHtml(s);
  } catch {
    return "";
  }
}

/* ───────────────────────── Base candidate ─────────────────────── */

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
    yearsScore: 0,
    eduScore: 0,
  };
}

/* ───────────────────────────── Route ──────────────────────────── */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // Job Requirements
    const rawJR = form.get("jobRequirements") as string;
    const jr: JobRequirements = rawJR ? JSON.parse(rawJR) : {
      title: "",
      description: "",
      minYearsExperience: 0,
      educationLevel: "",
    };

    // Resumes
    const files = form.getAll("resumes").filter(Boolean) as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No resumes" }, { status: 400 });
    }

    // Derive JD keywords once
    const kw = await llmDeriveKeywords(`${jr.title}\n\n${jr.description || ""}`);

    const results: Candidate[] = [];

    for (const file of files) {
      const id = crypto.randomBytes(8).toString("hex");
      const cand = baseCandidate(id);

      const raw = await extractTextFromFile(file);
      if (!raw) {
        // keep as blank candidate with domainMismatch true (no evidence)
        cand.domainMismatch = true;
        results.push(cand);
        continue;
      }

      // LLM profile (deterministic)
      const profile = await llmExtractProfile(raw);

      // Fill visible basics
      cand.name = profile?.name || "";
      cand.email = profile?.email || "";
      cand.phone = profile?.phone || "";
      cand.location = profile?.location || "";
      cand.title = profile?.headline || profile?.title || "";
      cand.summary = profile?.summary || "";

      // Education (mapped to a single string for card)
      let eduStr = "";
      if (Array.isArray(profile?.education) && profile.education.length) {
        const e0 = profile.education[0];
        eduStr = [mapEduLevel(e0?.degree || ""), e0?.field].filter(Boolean).join(" ");
      } else if (profile?.educationSummary) {
        eduStr = String(profile.educationSummary);
      }
      cand.education = eduStr || "";

      // Years of experience: prefer LLM, fallback to robust parser
      let years = 0;
      if (typeof profile?.yearsExperience === "number" && profile.yearsExperience > 0) {
        years = Math.min(45, Math.round(profile.yearsExperience));
      } else {
        years = robustYears(raw);
      }
      cand.yearsExperience = years;

      // Skill chips (clean)
      const skillChips = cleanTokens(
        Array.isArray(profile?.skills) ? profile.skills : []
      ).slice(0, 12);
      cand.skills = skillChips;

      // Domain decision (tolerant)
      const resumeTokens = buildResumeTokenSet(profile, raw);
      const domainMatch = computeDomainMatch(kw, resumeTokens);
      cand.domainMismatch = !domainMatch;

      // Heuristic coverage -> skillsEvidencePct
      const h = scoreHeuristically(raw, kw);
      cand.skillsEvidencePct = Math.round(clamp01(h.coverage) * 100);

      // Years & education score components
      const reqY = Math.max(0, Number(jr.minYearsExperience || 0));
      const yScore = reqY ? clamp01(years / reqY) : clamp01(years / 6); // 6y typical ramp
      const eScore = eduFit(jr.educationLevel || "", cand.education || "");

      cand.yearsScore = yScore;
      cand.eduScore = eScore;

      // Final match score (bounded & rounded)
      const match =
        0.65 * h.coverage + 0.25 * yScore + 0.10 * eScore;

      cand.matchScore = Math.round(clamp01(domainMatch ? match : match * 0.2) * 100);

      results.push(cand);
    }

    // Sort client might resort; we just return raw list
    const payload: AnalysisResult = { candidates: results };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
