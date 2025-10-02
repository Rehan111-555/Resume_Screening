import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

const key = process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");
const genAI = new GoogleGenerativeAI(key);

const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"] as const;
type ModelId = (typeof MODELS)[number];
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
      last = e; const msg = String(e?.message || e);
      const retriable = /fetch failed|timed out|ETIMEDOUT|429|quota|deadline/i.test(msg);
      if (!retriable || i === MAX_RETRIES) break;
      await sleep(700 * Math.pow(2, i));
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 8, responseMimeType: "text/plain" },
      });
      await withRetry(() => m.generateContent("ping"), `probe ${id}`);
      cachedModelId = id;
      return id;
    } catch { /* try next */ }
  }
  throw new Error("No enabled Gemini model (enable gemini-2.5-flash or gemini-2.5-pro).");
}

/* -------------------------- safety ------------------------- */
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];
const SYS = `You MUST return only valid JSON. No markdown. When unsure, use "", 0, false, or [].`;

/* -------------------------- helpers ------------------------ */
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
  try { return JSON.parse(raw) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

/* ======================= PUBLIC API ======================== */

/**
 * LLM extracts a rich, role-agnostic profile from resume TEXT.
 */
export async function llmExtractProfile(resumeText: string) {
  const prompt = `
Extract a clean JSON RESUME PROFILE from the following resume text. Be concise but complete.

Return ONLY JSON like:
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
  "education": [
    {"degree":"","field":"","institution":"","start":"","end":""}
  ],
  "experience": [
    {"title":"","company":"","location":"","start":"","end":"","achievements":["..."],"tech":["..."]}
  ],
  "links": {"portfolio":"","github":"","linkedin":"","other":[]},
  "yearsExperience": 0
}

RESUME:
"""${resumeText.slice(0, 16000)}"""
`;
  const model = await jsonModel(0.1);
  const res = await withRetry(() => model.generateContent(prompt), "extract-profile");
  return j<any>(res.response.text()) || {};
}

/**
 * LLM grades a candidate against the JD with a human rubric.
 * Also generates candidate-specific interview questions.
 */
export async function llmGradeCandidate(jdText: string, resumeText: string) {
  const prompt = `
You are a senior recruiter assessing a candidate vs a JOB DESCRIPTION.
Think step-by-step like a human reviewer. Use evidence from the resume.

Return ONLY JSON:
{
  "score": 0,                     // 0..100 overall
  "breakdown": {
    "jdAlignment": 0,            // 0..100 (responsibilities/deliverables)
    "impact": 0,                 // 0..100 (results, achievements)
    "toolsAndMethods": 0,        // 0..100 (tools/processes relevant to JD)
    "domainKnowledge": 0,        // 0..100 (industry/regulatory/context)
    "communication": 0           // 0..100 (writing clarity in resume)
  },
  "matchedSkills": ["..."],
  "missingSkills": ["..."],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "yearsExperienceEstimate": 0,
  "educationSummary": "",
  "questions": ["..."]           // 5–6 unique questions tailored to THIS candidate and THIS JD
}

JOB DESCRIPTION:
"""${jdText.slice(0, 10000)}"""

RESUME:
"""${resumeText.slice(0, 16000)}"""
`;
  const model = await jsonModel(0.2);
  const res = await withRetry(() => model.generateContent(prompt), "grade-candidate");
  const out = j<any>(res.response.text()) || {};
  // Guardrails
  out.score = Math.max(0, Math.min(100, Number(out.score || 0)));
  if (!Array.isArray(out.questions)) out.questions = [];
  return out;
}
