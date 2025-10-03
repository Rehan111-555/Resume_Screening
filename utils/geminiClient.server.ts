import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * ===== Why this version works better =====
 * - Two-pass LLM pipeline (JD signals -> Resume facts) + deterministic scoring
 * - No responseSchema (fixed your 400 errors); uses repair-to-JSON fallback
 * - Bigger token budget; robust retry/timeout logic
 * - Role-agnostic: works for ANY JD (tech, HR, finance, etc.)
 */

const key = process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");

const genAI = new GoogleGenerativeAI(key);

// Prefer Pro; fall back to Flash automatically
const MODEL_CANDIDATES = ["gemini-2.5-pro", "gemini-2.5-flash"] as const;
type ModelId = (typeof MODEL_CANDIDATES)[number];

let cachedModel: ModelId | null = null;

const TIMEOUT_MS = 70_000;
const MAX_RETRIES = 2;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  let t: any;
  const guard = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("Request timed out")), ms); });
  try { return (await Promise.race([p, guard])) as T; } finally { clearTimeout(t); }
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let last: any;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try { return await withTimeout(fn(), TIMEOUT_MS); }
    catch (e: any) {
      last = e;
      const msg = String(e?.message || e);
      const retriable = /fetch failed|timed out|ETIMEDOUT|ECONNRESET|429|quota|deadline/i.test(msg);
      if (!retriable || i === MAX_RETRIES) break;
      await sleep(700 * Math.pow(2, i));
    }
  }
  throw new Error(`${label}: ${String(last?.message || last)}`);
}

async function pickModel(): Promise<ModelId> {
  if (cachedModel) return cachedModel;
  for (const m of MODEL_CANDIDATES) {
    try {
      // a cheap probe (use proper contents shape)
      const probe = genAI.getGenerativeModel({ model: m, generationConfig: { temperature: 0 } });
      await withRetry(
        () => probe.generateContent({
          contents: [{ role: "user", parts: [{ text: "ok" }] }]
        }),
        `probe ${m}`
      );
      cachedModel = m;
      break;
    } catch { /* continue */ }
  }
  if (!cachedModel) throw new Error("No Gemini 2.5 model enabled.");
  return cachedModel;
}

/* ----------------------- helpers ----------------------- */

type ResumeProfile = {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  title?: string;
  skills?: string[];
  summary?: string;
  education?: { degree?: string; field?: string; institution?: string; start?: string; end?: string }[];
  experience?: { title?: string; company?: string; start?: string; end?: string; summary?: string }[];
  // raw text used only for fuzzy evidence
  _text?: string;
};
export type { ResumeProfile };

export type Candidate = {
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
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions?: string[]; // per-candidate unique questions
};
export type { Candidate as UICandidate };

type JobRequirements = {
  title: string;
  description: string;
  minYearsExperience: number;
  educationLevel: string;
};

type JobSignals = {
  must: { name: string; synonyms: string[] }[];
  nice: { name: string; synonyms: string[] }[];
};

function toInlinePart(bytes: Buffer, mimeType: string) {
  return { inlineData: { data: bytes.toString("base64"), mimeType } };
}

function safeJson<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const fenced = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(fenced) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

async function repairJson<T = any>(raw: string): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: await pickModel(),
    generationConfig: { temperature: 0, maxOutputTokens: 512 }
  });

  const res = await withRetry(
    () => model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Fix the following content into VALID JSON ONLY. No explanations.\n\n${raw}` }]
      }]
    }),
    "repair-json"
  );

  const txt = res.response.text();
  const parsed = safeJson<T>(txt);
  if (!parsed) throw new Error("Failed to repair JSON");
  return parsed;
}

/* ---------------- JD → Signals ---------------- */

function buildSignalsPrompt(jd: JobRequirements): string {
  return `
Read the JOB DESCRIPTION and extract competency signals that could appear in resumes. 
Return STRICT JSON with two arrays:

{
  "must": [{"name": "string", "synonyms": ["alias1","alias2", "..."]}],
  "nice": [{"name": "string", "synonyms": ["alias1","alias2", "..."]}]
}

Guidelines:
- General and role-agnostic. DO NOT hardcode to any single stack.
- Include domain, tools, certifications, methods, soft skills (management, compliance, customer service, etc), plus obvious synonyms/phrases.
- Keep total items under ~25 across must+nice.
- Use lowercase in "synonyms".
- Prefer concise names: e.g., {"name":"shopify liquid","synonyms":["liquid","shopify theme","theme customization"]}

JOB:
Title: ${jd.title}
Description:
${jd.description}
  `.trim();
}

export async function extractJobSignals(job: JobRequirements): Promise<JobSignals> {
  const model = genAI.getGenerativeModel({
    model: await pickModel(),
    generationConfig: { temperature: 0.2, maxOutputTokens: 1400 }
  });

  const res = await withRetry(
    () => model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildSignalsPrompt(job) }] }]
    }),
    "extract-job-signals"
  );

  const txt = res.response.text();
  return safeJson<JobSignals>(txt) || await repairJson<JobSignals>(txt);
}

/* ---------------- Resume → Profile ---------------- */

function buildProfilePrompt(fileName: string) {
  return `
Extract a RESUME PROFILE from the attached CV. JSON only:

{
  "name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "title": "string",
  "skills": ["..."],
  "summary": "string",
  "education": [{"degree":"","field":"","institution":"","start":"","end":""}],
  "experience": [{"title":"","company":"","start":"","end":"","summary":""}],
  "_text": "full plain text of resume for fuzzy matching"
}

- Dates can be any readable string.
- If unknown, use "" or [].
- Keep "skills" concise; prefer technology or competency words.
  `.trim();
}

export async function extractProfileFromFile(file: { bytes: Buffer; mimeType: string; name: string }): Promise<ResumeProfile> {
  const model = genAI.getGenerativeModel({
    model: await pickModel(),
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  });

  const res = await withRetry(() => model.generateContent({
    contents: [{
      role: "user",
      parts: [
        { text: `Extract profile from: ${file.name}` },
        toInlinePart(file.bytes, file.mimeType),
        { text: buildProfilePrompt(file.name) }
      ]
    }]
  }), "extract-profile");

  const txt = res.response.text();
  const parsed = safeJson<ResumeProfile>(txt) || await repairJson<ResumeProfile>(txt);
  if (!parsed.name) parsed.name = file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "");
  return parsed;
}

/* ---------------- Scoring & Questions ---------------- */

function norm(s?: string) { return (s || "").toLowerCase(); }
function tokenize(s: string): string[] {
  return norm(s)
    .replace(/[^a-z0-9+.#]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
function anyAliasInText(aliases: string[], text: string): boolean {
  const t = " " + norm(text) + " ";
  return aliases.some(a => t.includes(" " + norm(a) + " "));
}
function monthsBetween(start?: string, end?: string): number {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : new Date();
  if (!s || isNaN(+s) || !e || isNaN(+e)) return 0;
  return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}
function totalMonths(exps?: { start?: string; end?: string }[]) {
  if (!exps?.length) return 0;
  return exps.reduce((acc, x) => acc + monthsBetween(x.start, x.end), 0);
}
function simpleEducation(edu?: any[]): string {
  if (!edu?.length) return "";
  const e = edu[0];
  const deg = [e?.degree, e?.field].filter(Boolean).join(", ");
  return [deg, e?.institution].filter(Boolean).join(" - ");
}
function eduFit(required: string, edu: string) {
  const r = norm(required), e = norm(edu);
  if (!r) return 0.5; // neutral if not specified
  if (r.includes("phd")) return e.includes("phd") ? 1 : 0.7;
  if (r.includes("master")) return e.includes("master") || e.includes("msc") ? 1 : e ? 0.7 : 0;
  if (r.includes("bachelor")) return /bachelor|bs|bsc/.test(e) ? 1 : e ? 0.6 : 0;
  return e ? 0.7 : 0;
}

export type RichScore = {
  skillEvidencePct: number;
  overall: number;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoring: string[];
};

export function scoreCandidate(job: JobRequirements, signals: JobSignals, prof: ResumeProfile): RichScore {
  const fullText = [prof._text, prof.summary, ...(prof.skills || []), ...(prof.experience || []).map(x => [x.title, x.company, x.summary].join(" "))].join("\n");
  const mustMatched: string[] = [];
  const mustMissing: string[] = [];
  const niceMatched: string[] = [];

  for (const m of signals.must || []) {
    const aliases = [m.name, ...(m.synonyms || [])].map(norm);
    if (anyAliasInText(aliases, fullText)) mustMatched.push(m.name);
    else mustMissing.push(m.name);
  }
  for (const n of signals.nice || []) {
    const aliases = [n.name, ...(n.synonyms || [])].map(norm);
    if (anyAliasInText(aliases, fullText)) niceMatched.push(n.name);
  }

  const mustPct = (signals.must?.length ? mustMatched.length / signals.must.length : 0.7);
  const nicePct = (signals.nice?.length ? niceMatched.length / signals.nice.length : 0.5);
  const skillEvidencePct = Math.round((0.8 * mustPct + 0.2 * nicePct) * 100);

  const months = totalMonths(prof.experience);
  const years = months / 12;
  const expFit = job.minYearsExperience ? Math.min(1, years / job.minYearsExperience) : 1;

  const eduStr = simpleEducation(prof.education);
  const eduScore = eduFit(job.educationLevel, eduStr);

  // overall weighting: skills 50, exp 35, edu 15
  const overall = Math.round((0.5 * (skillEvidencePct/100) + 0.35 * expFit + 0.15 * eduScore) * 100);

  const strengths = [
    ...(mustMatched.length ? [`Evidence of key requirements: ${mustMatched.join(", ")}`] : []),
    ...(years ? [`Experience: ~${years.toFixed(1)} years`] : []),
    ...(eduStr ? [`Education: ${eduStr}`] : []),
  ];
  const weaknesses = [
    ...(mustMissing.length ? [`Missing/unclear: ${mustMissing.join(", ")}`] : []),
    ...(job.minYearsExperience && years < job.minYearsExperience ? [`Experience below ${job.minYearsExperience}y (has ~${years.toFixed(1)}y)`] : []),
  ];
  const gaps = mustMissing.map(g => `Evidence gap: ${g}`);
  const mentoring = mustMissing.slice(0,3).map(g => `Mentoring in ${g}`);

  return { skillEvidencePct, overall, strengths, weaknesses, gaps, mentoring };
}

function buildQuestionPrompt(job: JobRequirements, prof: ResumeProfile): string {
  return `
Generate 5 interview questions tailored to THIS candidate and THIS job.
Use resume evidence (skills, roles, achievements) and the JD (domain/tools/soft-skills).
Return JSON: {"questions":["...","...","...","...","..."]}

JOB: ${job.title}
JD:
${job.description.slice(0, 4000)}

RESUME (JSON):
${JSON.stringify({name:prof.name, title:prof.title, skills:prof.skills, summary:prof.summary, experience:prof.experience?.slice(0,5)})}
  `.trim();
}

export async function questionsForCandidate(job: JobRequirements, prof: ResumeProfile): Promise<string[]> {
  const model = genAI.getGenerativeModel({
    model: await pickModel(),
    generationConfig: { temperature: 0.5, maxOutputTokens: 900 }
  });

  const res = await withRetry(
    () => model.generateContent({
      contents: [{ role: "user", parts: [{ text: buildQuestionPrompt(job, prof) }] }]
    }),
    "questions-for-candidate"
  );

  const txt = res.response.text();
  const parsed = safeJson<{questions:string[]}>(txt) || await repairJson<{questions:string[]}>(txt);
  return Array.isArray(parsed.questions) ? parsed.questions.slice(0,5) : [];
}
