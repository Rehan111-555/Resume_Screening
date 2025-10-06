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
      /* try next */
    }
  }
  throw new Error(
    "No enabled Gemini model (enable gemini-2.5-flash or gemini-2.5-pro)."
  );
}

/** ─────────────────────── Safety / JSON ─────────────────── */
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
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
  if (/intermediate|high school|hs/i.test(x))
    return "Intermediate/High School";
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
export function cleanTokens(list: string[]): string[] {
  const BAD = new Set(
    [
      "best",
      "practices",
      "best practices",
      "proactive",
      "experience",
      "strong",
      "developer",
      "development",
      "customizing",
      "customizing shopify",
      "shopify s",
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

/** ───────────── heuristic timeline years extractor ───────────── */
export function estimateYears(text: string): number {
  const t = (text || "").replace(/\s+/g, " ");
  // patterns like "2019 - 2023", "Jan 2020 to Mar 2024"
  let months = 0;
  const period =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\.?\s*(\d{4})\s*(?:-|to|–|—)\s*(?:present|current|now|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\.?\s*(\d{4}))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = period.exec(t))) {
    const y1 = parseInt(m[1], 10);
    const y2 = m[2] ? parseInt(m[2], 10) : new Date().getFullYear();
    if (y1 >= 1980 && y1 <= y2 && y2 <= new Date().getFullYear() + 1) {
      months += (y2 - y1) * 12;
    }
  }
  // single “X years of experience”
  const single = /\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/i.exec(t);
  if (single && months === 0) return Math.min(40, parseFloat(single[1]));
  return Math.min(40, Math.round(months / 12));
}

/** ───────────── JD keywords (role-agnostic, not hardcoded) ───────────── */
export type JDKeywords = {
  must: { name: string; synonyms: string[] }[];
  nice: { name: string; synonyms: string[] }[];
};

const STOP_WORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "for",
    "to",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "as",
    "is",
    "are",
    "be",
    "this",
    "that",
    "these",
    "those",
    "will",
    "can",
    "should",
    "must",
    "we",
    "you",
    "our",
    "their",
    "your",
    "it",
    "they",
    "role",
    "job",
    "candidate",
    "position",
    "responsibilities",
    "requirements",
    "preferred",
    "experience",
    "years",
    "team",
    "work",
    "ability",
    "skills",
    "plus",
    "including",
    "etc",
  ].map((s) => s.toLowerCase())
);
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
- 6–10 "must" items (core responsibilities, core tools/processes).
- 4–8  "nice" items (nice-to-haves: tools, domains, certs).
- Synonyms: short realistic variants (abbrev/spelling variants). 2–6 per item.
- No commentary. JSON only.

JOB DESCRIPTION:
"""${(jdText || "").slice(0, 12000)}"""
`;
  const model = await jsonModel(0);
  const res = await withRetry(
    () => model.generateContent(prompt),
    "jd-keywords"
  );
  let out = j<JDKeywords>(res.response.text());

  if (!out || (!out.must?.length && !out.nice?.length)) {
    const terms = topTermsFromJD(jdText, 20);
    const must = terms.slice(0, 10).map((name) => ({
      name,
      synonyms: localSynonyms(name),
    }));
    const nice = terms.slice(10, 18).map((name) => ({
      name,
      synonyms: localSynonyms(name),
    }));
    out = { must, nice };
  }

  const norm = (s: string) => s.toLowerCase().trim();
  const uniq = (arr: string[]) =>
    Array.from(new Set(arr.map(norm))).filter(Boolean);

  out.must = (out.must || [])
    .map((k) => ({
      name: norm(k.name || ""),
      synonyms: uniq([...(k.synonyms || []), ...localSynonyms(k.name || "")]),
    }))
    .filter((k) => k.name);
  out.nice = (out.nice || [])
    .map((k) => ({
      name: norm(k.name || ""),
      synonyms: uniq([...(k.synonyms || []), ...localSynonyms(k.name || "")]),
    }))
    .filter((k) => k.name);

  if (!out.must.length && !out.nice.length) {
    const terms = topTermsFromJD(jdText, 16);
    out.must = terms.slice(0, 8).map((name) => ({
      name,
      synonyms: localSynonyms(name),
    }));
    out.nice = terms.slice(8, 16).map((name) => ({
      name,
      synonyms: localSynonyms(name),
    }));
  }
  return out;
}

/** ───────────── Heuristic fuzzy scoring over resume text ───────────── */
export type HeuristicScore = {
  coverage: number; // 0..1 (weighted must/nice)
  matched: string[];
  missing: string[]; // must only
};
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\+\.\-#& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function fuzzyContains(text: string, phrase: string): boolean {
  const T = " " + norm(text) + " ";
  const p = norm(phrase);
  if (!p) return false;
  if (T.includes(` ${p} `)) return true;
  if (T.includes(p)) return true;
  // tiny tol.
  const L = p.length;
  for (let i = 0; i <= T.length - L; i++) {
    let d = 0;
    for (let j = 0; j < L && d <= 1; j++) if (T[i + j] !== p[j]) d++;
    if (d <= 1) return true;
  }
  return false;
}
export function scoreHeuristically(
  resumeText: string,
  kw: JDKeywords
): HeuristicScore {
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

/** ───────────── LLM rubric (kept, blended) ───────────── */
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
"""${(resumeText || "").slice(0, 16000)}"""
`;
  const model = await jsonModel(0);
  const res = await withRetry(
    () => model.generateContent(prompt),
    "extract-profile"
  );
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

JOB DESCRIPTION:
"""${(jdText || "").slice(0, 10000)}"""

RESUME:
"""${(resumeText || "").slice(0, 16000)}"""
`;
  const model = await jsonModel(0);
  const res = await withRetry(
    () => model.generateContent(prompt),
    "grade-candidate"
  );
  const out = j<any>(res.response.text()) || {};
  out.score = Math.max(0, Math.min(100, Number(out.score || 0)));
  if (!Array.isArray(out.questions)) out.questions = [];
  if (!Array.isArray(out.matchedSkills)) out.matchedSkills = [];
  if (!Array.isArray(out.missingSkills)) out.missingSkills = [];
  if (!Array.isArray(out.strengths)) out.strengths = [];
  if (!Array.isArray(out.weaknesses)) out.weaknesses = [];
  return out;
}
