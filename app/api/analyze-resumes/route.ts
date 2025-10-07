// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Candidate, AnalysisResult, JobRequirements } from "@/types";

/** Small helpers (no external deps) */
function stripHtml(s: string) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function norm(s: string) {
  return (s || "").toLowerCase().replace(/[^a-z0-9+#\.\- ]+/g, " ").replace(/\s+/g, " ").trim();
}
function uniq(xs: string[]) {
  return Array.from(new Set(xs.filter(Boolean)));
}

function tokenizeJD(jd: string): string[] {
  const stop = new Set(["the","and","or","with","to","for","of","in","on","at","as","is","are","a","an","be","will","can","should","years","experience","role","job","position","candidate","responsibilities","requirements"]);
  const t = norm(jd).split(" ").filter(Boolean);
  const grams = new Map<string, number>();
  const inc = (k: string) => grams.set(k, (grams.get(k) || 0) + 1);
  for (let i=0;i<t.length;i++){
    if(!stop.has(t[i])) inc(t[i]);
    if(i+1<t.length) inc(t[i]+" "+t[i+1]);
  }
  return [...grams.entries()].sort((a,b)=>b[1]-a[1]).map(([k])=>k).slice(0,16);
}

function estimateYears(text: string): number {
  const T = (text || "").replace(/\s+/g, " ");
  // ranges like 2019-2024, Jan 2020 – Present, etc.
  const re = /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*)?(\d{4})\s*(?:-|–|—|to)\s*(?:present|current|now|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*)?(\d{4}))\b/gi;
  let months = 0, m: RegExpExecArray | null;
  while ((m = re.exec(T))) {
    const y1 = +m[1];
    const y2 = m[2] ? +m[2] : new Date().getFullYear();
    if (y1 >= 1980 && y2 >= y1) months += (y2 - y1) * 12;
  }
  const one = /\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i.exec(T);
  if (one && months === 0) return Math.min(40, +one[1]);
  return Math.min(40, Math.round(months / 12));
}

function scoreFrom(text: string, jdText: string) {
  const tokens = tokenizeJD(jdText);
  const hay = norm(text);
  const hits = tokens.filter((k) => hay.includes(k));
  const mustShare = tokens.length ? hits.length / tokens.length : 0.5;
  return {
    matchScore: Math.round(100 * (0.75 * mustShare + 0.25 * Math.min(1, estimateYears(text) / 8))),
    skillsEvidencePct: Math.round(100 * mustShare),
    matched: hits,
  };
}

function safeCandidateSkeleton(id: string): Candidate {
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
    formatted: "",
  };
}

async function readTextFromFile(f: File): Promise<string> {
  const type = (f.type || "").toLowerCase();
  const name = f.name || "file";

  // TXT/RTF
  if (type.includes("text")) {
    return await f.text();
  }

  // quick-n-dirty: if html-like
  if (type.includes("html")) {
    return stripHtml(await f.text());
  }

  // We can’t parse PDFs/DOCX here without native libs. Fallback:
  // Include filename and a tiny hint so the scoring still gets some tokens.
  return `Resume: ${name}`;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const jdRaw = String(form.get("jobRequirements") || "{}");
  const jd: JobRequirements = JSON.parse(jdRaw);

  const files = form.getAll("resumes").filter((x): x is File => x instanceof File);

  const out: Candidate[] = [];

  for (const f of files) {
    const id = crypto.randomUUID();
    const base = safeCandidateSkeleton(id);

    const text = await readTextFromFile(f);
    const clean = stripHtml(text);

    // very light extraction (avoid hallucinations)
    base.name = (clean.match(/\bname[:\-]\s*([^\n\r]+)/i)?.[1] || "").trim();
    base.email = (clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "").trim();
    base.phone = (clean.match(/(\+?\d[\d\-\s]{7,}\d)/)?.[0] || "").trim();
    base.location = (clean.match(/\b(location|address)[:\-]\s*([^\n\r]+)/i)?.[2] || "").trim();
    base.summary = clean.slice(0, 1200);
    base.yearsExperience = estimateYears(clean);

    // skills: pick frequent tokens that look like tech/skills
    const words = uniq(
      clean
        .toLowerCase()
        .match(/[a-z0-9+.#-]{3,}/g)
        ?.slice(0, 4000) || []
    );
    base.skills = words.slice(0, 12);

    const { matchScore, skillsEvidencePct } = scoreFrom(clean, `${jd.title} ${jd.description}`);
    base.matchScore = matchScore;
    base.skillsEvidencePct = skillsEvidencePct;

    // Domain check (no hardcoded lists) — if we find almost no overlap with JD tokens, flag mismatch
    const jdTokens = tokenizeJD(`${jd.title} ${jd.description}`);
    const hits = jdTokens.filter((k) => norm(clean).includes(k));
    base.domainMismatch = jdTokens.length > 0 && hits.length <= Math.max(1, Math.floor(jdTokens.length * 0.15));

    // formatted block for Copy button
    base.formatted =
      `Candidate: ${base.name || f.name}\n` +
      `Email: ${base.email || "—"}\n` +
      `Phone: ${base.phone || "—"}\n` +
      `Location: ${base.location || "—"}\n\n` +
      `Experience: ${base.yearsExperience} years\n` +
      `Skills: ${base.skills.join(", ") || "—"}\n\n` +
      `Summary:\n${base.summary || "—"}\n`;

    out.push(base);
  }

  const payload: AnalysisResult = { candidates: out };
  return NextResponse.json(payload, { status: 200 });
}
