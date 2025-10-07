// utils/geminiClient.server.ts
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

/** ───────────────────────── Setup ───────────────────────── */
const key = process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");
const genAI = new GoogleGenerativeAI(key);

const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"] as const;
type ModelId = (typeof MODELS)[number];
let cachedModelId: ModelId | null = null;

const TIMEOUT_MS = 55_000;
const MAX_RETRIES = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: any;
  const guard = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("Request timed out")), ms);
  });
  try {
    return (await Promise.race([p, guard])) as T;
  } finally {
    clearTimeout(t);
  }
}
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let last: any;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await withTimeout(fn(), TIMEOUT_MS);
    } catch (e: any) {
      last = e;
      const msg = String(e?.message || e);
      const retriable = /fetch failed|timed out|ETIMEDOUT|429|quota|deadline/i.test(
        msg
      );
      if (!retriable || i === MAX_RETRIES) break;
      await sleep(600 * Math.pow(2, i));
    }
  }
  throw new Error(`${label}: ${String(last?.message || last)}`);
}
async function pickModel(): Promise<ModelId> {
  if (cachedModelId) return cachedModelId;
  for (const id of MODELS) {
    try {
      const m = genAI.getGenerativeModel({
        model: id,
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8,
          responseMimeType: "text/plain",
        },
      });
      await withRetry(() => m.generateContent("ping"), `probe ${id}`);
      cachedModelId = id;
      return id;
    } catch {
      // try next
    }
  }
  throw new Error(
    "No enabled Gemini model (enable gemini-2.5-flash or gemini-2.5-pro)."
  );
}

/** ─────────────────────── Safety / JSON ─────────────────── */
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];
const SYS = `You MUST return only valid JSON. No markdown. Use "", 0, false, or [] when unsure.`;

async function jsonModel(temperature = 0) {
  const id = await pickModel();
  return genAI.getGenerativeModel({
    model: id,
    systemInstruction: SYS,
    generationConfig: {
      temperature,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
    safetySettings,
  });
}
function j<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) {
    try {
      return JSON.parse(m[0]) as T;
    } catch {}
  }
  return null;
}

/** ───────────────────── Small helpers ───────────────────── */
export function mapEduLevel(s: string): string {
  const x = (s || "").toLowerCase();
  if (/ph\.?d|doctor/i.test(x)) return "PhD";
  if (/master|msc|ms\b/i.test(x)) return "Master";
  if (/bachelor|bs\b|bsc\b/i.test(x)) return "Bachelor";
  if (/intermediate|high school|hs/i.test(x)) return "Intermediate/High School";
  return s || "";
}
export function eduFit(required?: string, have?: string): number {
  const r = (required || "").toLowerCase();
  const h = (have || "").toLowerCase();
  if (!r) return 0.7;
  if (r.includes("phd")) return h.includes("phd") ? 1 : 0.6;
  if (r.includes("master"))
    return h.match(/phd|master/) ? 1 : h.includes("bachelor") ? 0.7 : 0.4;
  if (r.includes("bachelor")) return h.match(/phd|master|bachelor/) ? 1 : 0.5;
  return h ? 0.7 : 0.3;
}
export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** IMPORTANT: export cleanTokens (needed by route.ts) */
export function cleanTokens(list: string[]): string[] {
  const BAD = new Set(
    [
      "best","practices","best practices","proactive","experience","strong",
      "developer","development","customizing","customizing shopify","shopify s",
      "understanding","skills","knowledge"
    ].map((s) => s.toLowerCase())
  );
  return Array.from(
    new Set(
      (list || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map((x) => x.replace(/\.+$/g, "").toLowerCase())
        .filter((x) => x.length > 2 && !BAD.has(x))
    )
  );
}

/** ───────────── robust experience estimator ───────────── */
function parseMonth(s: string): number | null {
  const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","sept","oct","nov","dec"];
  const idx = months.indexOf(s.slice(0,4).toLowerCase());
  return idx >= 0 ? (idx > 10 ? 10 : idx) : null;
}
export function estimateYears(text: string): number {
  const t = (text || "").replace(/\s+/g, " ").toLowerCase();

  type Period = { from: Date; to: Date };
  const periods: Period[] = [];
  const curYear = new Date().getFullYear();

  // Month Year – Month Year / Present
  const re1 =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{4})\s*(?:-|–|—|to)\s*(?:present|current|now|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{4}))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(t))) {
    const m1 = parseMonth(m[1]) ?? 0;
    const y1 = parseInt(m[2], 10);
    const m2 = m[3] ? parseMonth(m[3]) ?? 11 : new Date().getMonth();
    const y2 = m[4] ? parseInt(m[4], 10) : curYear;
    if (y1 >= 1980 && y1 <= y2 && y2 <= curYear + 1) {
      periods.push({ from: new Date(y1, m1, 1), to: new Date(y2, m2, 1) });
    }
  }

  // Year – Year
  const re2 = /\b(\d{4})\s*(?:-|–|—|to)\s*(present|current|now|\d{4})\b/g;
  while ((m = re2.exec(t))) {
    const y1 = parseInt(m[1], 10);
    const y2 = /present|current|now/.test(m[2]) ? curYear : parseInt(m[2], 10);
    if (y1 >= 1980 && y1 <= y2 && y2 <= curYear + 1) {
      periods.push({ from: new Date(y1, 0, 1), to: new Date(y2, 11, 1) });
    }
  }

  // Merge overlaps
  periods.sort((a, b) => a.from.getTime() - b.from.getTime());
  const merged: Period[] = [];
  for (const p of periods) {
    if (!merged.length) merged.push(p);
    else {
      const last = merged[merged.length - 1];
      if (p.from <= last.to) {
        if (p.to > last.to) last.to = p.to;
      } else merged.push(p);
    }
  }
  let months = 0;
  for (const p of merged) {
    months += (p.to.getFullYear() - p.from.getFullYear()) * 12 + (p.to.getMonth() - p.from.getMonth()) + 1;
  }

  // fallback “X years”
  const single = /\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i.exec(t);
  if (months === 0 && single) return Math.min(40, parseFloat(single[1]));
  return Math.min(40, Math.round(months / 12));
}

/** ───────────── Domain similarity (automatic) ───────────── */
const STOP_WORDS = new Set(
  [
    "the","a","an","and","or","of","for","to","in","on","at","by","with","from","as",
    "is","are","be","this","that","these","those","will","can","should","must",
    "we","you","our","their","your","it","they",
    "role","job","candidate","position","responsibilities","requirements","preferred",
    "experience","years","team","work","ability","skills","plus","including","etc",
  ].map((s) => s.toLowerCase())
);
function ngrams(words: string[], n: 1|2|3): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
}
function bag(text: string): Map<string, number> {
  const tokens = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t));
  const grams = [...tokens, ...ngrams(tokens,1), ...ngrams(tokens,2), ...ngrams(tokens,3)];
  const m = new Map<string, number>();
  for (const g of grams) m.set(g, (m.get(g) || 0) + 1);
  return m;
}
function cosine(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0, na = 0, nb = 0;
  for (const [,v] of a) na += v*v;
  for (const [,v] of b) nb += v*v;
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) dot += (a.get(k)||0) * (b.get(k)||0);
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
export function domainSimilarity(jdText: string, resumeText: string): number {
  return cosine(bag(jdText), bag(resumeText));
}

/** ───────────── JD keywords & LLM calls ───────────── */
export type JDKeywords = {
  must: { name: string; synonyms: string[] }[];
  nice: { name: string; synonyms: string[] }[];
};

function tokenizeJD(jd: string): string[] {
  return (jd || "")
    .toLowerCase()
    .replace(/[^a-z0-9\-\+\.#& ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOP_WORDS.has(t))
    .slice(0, 4000);
}
function topTermsFromJD(jd: string, count = 16) {
  const tokens = tokenizeJD(jd);
  const grams = new Map<string, number>();
  const add = (k: string) => grams.set(k, (grams.get(k) || 0) + 1);
  for (let i = 0; i < tokens.length; i++) {
    add(tokens[i]);
    if (i + 1 < tokens.length) add(tokens[i] + " " + tokens[i + 1]);
    if (i + 2 < tokens.length) add(tokens[i] + " " + tokens[i + 2]);
  }
  return Array.from(grams.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => k.length >= 3)
    .slice(0, count);
}
function localSynonyms(term: string): string[] {
  const t = term.toLowerCase().trim();
  const out = new Set<string>([t]);
  out.add(t.replace(/\s+/g, ""));
  out.add(t.replace(/\s+/g, "-"));
  out.add(t.replace(/\s+/g, "."));
  out.add(t.replace(/[-._]/g, " "));
  if (t.endsWith("s")) out.add(t.slice(0, -1));
  else out.add(t + "s");
  out.add(t.replace(/javascript/i, "js"));
  out.add(t.replace(/\bjs\b/i, "javascript"));
  out.add(t.replace(/user experience/i, "ux"));
  out.add(t.replace(/user interface/i, "ui"));
  return Array.from(out).filter(Boolean);
}

export async function llmDeriveKeywords(jdText: string): Promise<JDKeywords> {
  const prompt = `
From the JOB DESCRIPTION below, extract hiring themes/competencies as keywords WITH realistic synonyms. Use only JD content.

Return ONLY JSON:
{
  "must": [{"name":"", "synonyms":["",""]}],
  "nice": [{"name":"", "synonyms":["",""]}]
}

Rules:
- 6–10 "must" items.
- 4–8  "nice" items.
- Synonyms: short realistic variants (2–6).
- JSON only.

JD:
"""${(jdText || "").slice(0, 12000)}"""`;

  const model = await jsonModel(0);
  const res = await withRetry(() => model.generateContent(prompt), "jd-keywords");
  let out = j<JDKeywords>(res.response.text());

  if (!out || (!out.must?.length && !out.nice?.length)) {
    const terms = topTermsFromJD(jdText, 20);
    out = {
      must: terms.slice(0, 10).map((name) => ({ name, synonyms: localSynonyms(name) })),
      nice: terms.slice(10, 18).map((name) => ({ name, synonyms: localSynonyms(name) })),
    };
  }

  const norm = (s: string) => s.toLowerCase().trim();
  const uniq = (arr: string[]) => Array.from(new Set(arr.map(norm))).filter(Boolean);

  out.must = (out.must || [])
    .map((k) => ({ name: norm(k.name || ""), synonyms: uniq([...(k.synonyms || []), ...localSynonyms(k.name || "")]) }))
    .filter((k) => k.name);
  out.nice = (out.nice || [])
    .map((k) => ({ name: norm(k.name || ""), synonyms: uniq([...(k.synonyms || []), ...localSynonyms(k.name || "")]) }))
    .filter((k) => k.name);

  return out;
}

export type HeuristicScore = {
  coverage: number; // 0..1
  matched: string[];
  missing: string[];
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\+\.\-#& ]+/g, " ").replace(/\s+/g, " ").trim();
}
function fuzzyContains(text: string, phrase: string): boolean {
  const T = " " + norm(text) + " ";
  const p = norm(phrase);
  if (!p) return false;
  if (T.includes(` ${p} `)) return true;
  if (T.includes(p)) return true;
  const L = p.length;
  for (let i = 0; i <= T.length - L; i++) {
    let d = 0;
    for (let j = 0; j < L && d <= 1; j++) if (T[i + j] !== p[j]) d++;
    if (d <= 1) return true;
  }
  return false;
}
export function scoreHeuristically(resumeText: string, kw: JDKeywords): HeuristicScore {
  const text = resumeText.toLowerCase();
  const must = kw.must.map((k) => ({ canon: k.name, syns: [k.name, ...k.synonyms] }));
  const nice = kw.nice.map((k) => ({ canon: k.name, syns: [k.name, ...k.synonyms] }));
  const matched = new Set<string>();
  const hit = (syns: string[]) => syns.some((s) => fuzzyContains(text, s));
  let mf = 0;
  for (const g of must) if (hit(g.syns)) { mf++; matched.add(g.canon); }
  let nf = 0;
  for (const g of nice) if (hit(g.syns)) { nf++; matched.add(g.canon); }
  const mustCov = must.length ? mf / must.length : 1;
  const niceCov = nice.length ? nf / Math.max(1, nice.length) : 1;
  const coverage = 0.75 * mustCov + 0.25 * niceCov;
  const missing = must.filter((g) => !matched.has(g.canon)).map((g) => g.canon);
  return { coverage, matched: Array.from(matched), missing };
}

/** ───────────── LLM extract / grade ───────────── */
export async function llmExtractProfile(resumeText: string) {
  const prompt = `
Extract a clean JSON RESUME PROFILE from the following resume text. Be concise but complete.

Return ONLY JSON:
{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "headline": "",
  "summary": "",
  "skills": ["..."],
  "tools": ["..."],
  "industryDomains": ["..."],
  "education": [{"degree":"","field":"","institution":"","start":"","end":""}],
  "experience": [{"title":"","company":"","location":"","start":"","end":"","achievements":["..."],"tech":["..."]}],
  "links": {"portfolio":"","github":"","linkedin":"","other":[]},
  "yearsExperience": 0
}

RESUME:
"""${(resumeText || "").slice(0, 16000)}"""`;
  const model = await jsonModel(0);
  const res = await withRetry(() => model.generateContent(prompt), "extract-profile");
  return j<any>(res.response.text()) || {};
}

export async function llmGradeCandidate(jdText: string, resumeText: string) {
  const prompt = `
You are a senior recruiter assessing a candidate vs a JOB DESCRIPTION. Think step-by-step like a human reviewer. Use evidence from the resume.

Return ONLY JSON:
{
  "score": 0,
  "breakdown": { "jdAlignment": 0, "impact": 0, "toolsAndMethods": 0, "domainKnowledge": 0, "communication": 0 },
  "matchedSkills": ["..."],
  "missingSkills": ["..."],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "yearsExperienceEstimate": 0,
  "educationSummary": "",
  "questions": ["..."]
}

JD:
"""${(jdText || "").slice(0, 10000)}"""

RESUME:
"""${(resumeText || "").slice(0, 16000)}"""`;
  const model = await jsonModel(0);
  const res = await withRetry(() => model.generateContent(prompt), "grade-candidate");
  const out = j<any>(res.response.text()) || {};
  out.score = Math.max(0, Math.min(100, Number(out.score || 0)));
  if (!Array.isArray(out.questions)) out.questions = [];
  if (!Array.isArray(out.matchedSkills)) out.matchedSkills = [];
  if (!Array.isArray(out.missingSkills)) out.missingSkills = [];
  if (!Array.isArray(out.strengths)) out.strengths = [];
  if (!Array.isArray(out.weaknesses)) out.weaknesses = [];
  return out;
}
