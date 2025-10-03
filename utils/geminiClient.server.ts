// utils/geminiClient.server.ts
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import type { Candidate, JobRequirements } from "@/types";

const key = process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");

const genAI = new GoogleGenerativeAI(key);

// Model selection
const CANDIDATE_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"] as const;
type ModelId = (typeof CANDIDATE_MODELS)[number];
let cachedModelId: ModelId | null = null;

const TIMEOUT_MS = 55_000;
const MAX_RETRIES = 2;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: any;
  const guard = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("Request timed out")), ms); });
  try { return (await Promise.race([p, guard])) as T; }
  finally { clearTimeout(t); }
}
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let last: any;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try { return await withTimeout(fn(), TIMEOUT_MS); }
    catch (e: any) {
      last = e;
      const msg = String(e?.message || e);
      const retriable = /fetch failed|timed out|ETIMEDOUT|429|quota|deadline/i.test(msg);
      if (!retriable || i === MAX_RETRIES) break;
      await sleep(600 * Math.pow(2, i));
    }
  }
  throw new Error(`${label}: ${String(last?.message || last)}`);
}
async function pickModel(): Promise<ModelId> {
  if (cachedModelId) return cachedModelId;
  for (const id of CANDIDATE_MODELS) {
    try {
      const probe = genAI.getGenerativeModel({
        model: id,
        generationConfig: { temperature: 0.1, maxOutputTokens: 8, responseMimeType: "text/plain" },
      });
      await withRetry(() => probe.generateContent("ping"), `probe ${id}`);
      cachedModelId = id;
      return id;
    } catch {
      // try next
    }
  }
  throw new Error(`No compatible Gemini model (enable gemini-2.5-flash or gemini-2.5-pro).`);
}

/** ---------- JSON helpers ---------- */
export function safeParse<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const fenced = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(fenced) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

async function repairToJson<T = any>(raw: string): Promise<T> {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: `You are a repair tool. Output ONLY valid JSON. No commentary.`,
    generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: "application/json" },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });
  const res = await withRetry(
    () => model.generateContent([{ role: "user", parts: [{ text: `Fix to strict JSON:\n${raw}` }] } as any]),
    "json-repair"
  );
  const text = res.response.text();
  const parsed = safeParse<T>(text);
  if (parsed) return parsed;
  // last-ditch: wrap object-likes
  try { return JSON.parse(text) as T; } catch {}
  throw new Error("JSON repair failed");
}

/** ---------- Prompts ---------- */
const SYSTEM_JSON = `
Return ONLY strict JSON (UTF-8). No explanations, no markdown. 
If something is unknown, return empty strings or [].
`;

function profilePrompt(fileName: string) {
  return `
Extract a RESUME PROFILE from the attached CV. Return JSON:

{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "title": "",
  "skills": [],
  "summary": "",
  "education": [{"degree":"","field":"","institution":"","start":"","end":""}],
  "experience": [{"title":"","company":"","start":"","end":"","summary":""}]
}

File: ${fileName}
Dates may be "Apr 2021", "2018-09", "09/2018", etc.
`;
}

function jobSignalsPrompt(job: JobRequirements) {
  return `
From the JOB DESCRIPTION, extract hiring signals as **role-agnostic** keywords with synonyms (things likely to appear on resumes). 
Return JSON:

{
  "mustHaves": [{"name":"","synonyms":[]}],
  "niceToHaves": [{"name":"","synonyms":[]}],
  "educationHints": ["", ""]
}

Guidelines:
- Derive **only** from the JD below (no prior lists).
- Use skill/topics, tools, domains, responsibilities, certifications, seniority cues.
- Keep 5–12 mustHaves and 3–8 niceToHaves max.
- Synonyms should include common phrasing variants and abbreviations.

JOB TITLE: ${job.title}
MIN YEARS: ${job.minYearsExperience}
EDUCATION LEVEL: ${job.educationLevel}

JD:
"""${job.description.slice(0, 8000)}"""
`;
}

function analysisPrompt(job: JobRequirements, jobSignals: JobSignals, profile: ResumeProfile) {
  return `
You will evaluate a single resume profile **strictly vs the Job Description signals**.

JOB:
${JSON.stringify(job)}

JOB_SIGNALS:
${JSON.stringify(jobSignals)}

RESUME_PROFILE:
${JSON.stringify(profile).slice(0, 8000)}

Return JSON:

{
  "candidate": {
    "id": "uuid-or-any-id",
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "title": "",
    "yearsExperience": 0,
    "education": "",
    "skills": [],
    "summary": "",
    "matchScore": 0,
    "strengths": [],
    "weaknesses": [],
    "gaps": [],
    "mentoringNeeds": [],
    "questions": []
  }
}

Scoring rules:
- Base on mustHaves/niceToHaves evidence **found in profile** (skills + experience text).
- Consider yearsExperience vs MIN YEARS.
- Education fit vs EDUCATION LEVEL (approximate).
- Be realistic and **do not hallucinate**. If a required item is missing, mark it as gap.
- Generate **6 tailored interview questions** for this candidate matching JD focus.
`;
}

/** ---------- Types used internally ---------- */
export type ResumeProfile = {
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  title?: string;
  skills?: string[];
  summary?: string;
  education?: { degree?: string; field?: string; institution?: string; start?: string; end?: string }[];
  experience?: { title?: string; company?: string; start?: string; end?: string; summary?: string }[];
};

export type JobSignals = {
  mustHaves: { name: string; synonyms: string[] }[];
  niceToHaves: { name: string; synonyms: string[] }[];
  educationHints: string[];
};

/** ---------- Core helpers ---------- */
function toInlinePart(bytes: Buffer, mimeType: string) {
  return { inlineData: { data: bytes.toString("base64"), mimeType } };
}

function ensureArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** ---------- Public API ---------- */
export async function extractProfileFromFile(file: { bytes: Buffer; mimeType: string; name: string }): Promise<ResumeProfile> {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON,
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
  });
  const res = await withRetry(
    () =>
      model.generateContent({
        contents: [
          { role: "user", parts: [{ text: profilePrompt(file.name) }, toInlinePart(file.bytes, file.mimeType)] as any },
        ],
      }),
    `extract-profile (${modelId})`
  );
  const text = res.response.text();
  const parsed = safeParse<ResumeProfile>(text) || (await repairToJson<ResumeProfile>(text));
  parsed.name ||= file.name.replace(/\.(pdf|docx|doc|png|jpg|jpeg)$/i, "");
  parsed.skills = ensureArray(parsed.skills);
  parsed.education = ensureArray(parsed.education);
  parsed.experience = ensureArray(parsed.experience);
  return parsed;
}

export async function extractJobSignals(job: JobRequirements): Promise<JobSignals> {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON,
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" },
  });
  const res = await withRetry(
    () => model.generateContent([{ role: "user", parts: [{ text: jobSignalsPrompt(job) }] } as any]),
    `job-signals (${modelId})`
  );
  const text = res.response.text();
  const parsed = safeParse<JobSignals>(text) || (await repairToJson<JobSignals>(text));
  parsed.mustHaves = ensureArray(parsed.mustHaves).slice(0, 12);
  parsed.niceToHaves = ensureArray(parsed.niceToHaves).slice(0, 8);
  parsed.educationHints = ensureArray(parsed.educationHints).slice(0, 6);
  return parsed;
}

export async function analyzeOneCandidate(
  job: JobRequirements,
  jobSignals: JobSignals,
  profile: ResumeProfile
): Promise<Candidate> {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON,
    generationConfig: { temperature: 0.15, maxOutputTokens: 2048, responseMimeType: "application/json" },
  });

  const res = await withRetry(
    () => model.generateContent([{ role: "user", parts: [{ text: analysisPrompt(job, jobSignals, profile) }] } as any]),
    `analyze-candidate (${modelId})`
  );

  const text = res.response.text();
  const parsed = safeParse<{ candidate: Candidate }>(text) || (await repairToJson<{ candidate: Candidate }>(text));
  const cand = parsed.candidate;

  // Guardrails: ensure arrays exist
  cand.skills ||= [];
  cand.strengths ||= [];
  cand.weaknesses ||= [];
  cand.gaps ||= [];
  cand.mentoringNeeds ||= [];
  cand.questions ||= [];

  // Clamp match score
  cand.matchScore = Math.max(0, Math.min(100, Math.round(Number(cand.matchScore) || 0)));
  return cand;
}
