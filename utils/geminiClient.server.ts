import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import type { JobSpec } from "@/types";

/* -------------------------- setup -------------------------- */
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
const SYS = `You MUST return only valid JSON. No markdown. When unsure, use empty strings or empty arrays.`;

/* -------------------------- helpers ------------------------ */
async function modelForJSON(schema?: any, temperature = 0) {
  const id = await pickModel();
  return genAI.getGenerativeModel({
    model: id,
    systemInstruction: SYS,
    generationConfig: {
      temperature,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema as any } : {}),
    },
    safetySettings,
  });
}

/* ======================= PUBLIC API ======================== */

/**
 * Extract a **generic JobSpec** from free-text JD.
 */
export async function extractJobSpec(jdText: string): Promise<JobSpec> {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      minYears: { type: ["number","null"] },
      education: { type: ["string","null"] },
      mustHaves: { type: "array", items: { type: "string" } },
      niceToHaves: { type: "array", items: { type: "string" } },
      skills: {
        type: "array",
        items: {
          type: "object",
          properties: { canonical: { type: "string" }, aliases: { type: "array", items: { type: "string" } } },
          required: ["canonical"],
        }
      }
    },
    required: ["title"],
  };

  const prompt = `
From the JOB DESCRIPTION below, build a compact JSON JobSpec.

Rules:
- Use concise, role-agnostic skill names ("accounts payable","vendor management","compliance testing","customer service","excel","photoshop","typescript","graphql","procurement", etc.)
- For each important skill/requirement, include several common ALIASES people write on resumes (abbreviations, synonyms, phrasing variants).
- Classify skills into mustHaves vs niceToHaves based on the JD emphasis.

Return JSON:
{
  "title": "string",
  "minYears": number | null,
  "education": "string | null",
  "mustHaves": ["skill","skill",...],
  "niceToHaves": ["skill",...],
  "skills": [
    { "canonical":"skill", "aliases":["alias1","alias2"] },
    ...
  ]
}

JOB DESCRIPTION:
"""${jdText}"""
`;

  const model = await modelForJSON(schema, 0);
  const res = await withRetry(() => model.generateContent(prompt), "extract-jobspec");
  const data = JSON.parse(res.response.text()) as {
    title?: string;
    minYears?: number | null;
    education?: string | null;
    mustHaves?: string[];
    niceToHaves?: string[];
    skills?: { canonical?: string; aliases?: string[] }[];
  };

  const canon = (x: string) => String(x || "").toLowerCase();

  const skillsArr: { canonical: string; aliases: string[] }[] = Array.isArray(data.skills)
    ? (data.skills as { canonical?: string; aliases?: string[] }[])
        .map((s: { canonical?: string; aliases?: string[] }) => ({
          canonical: canon(s.canonical || ""),
          aliases: (s.aliases || []).map((a: string) => canon(a)),
        }))
        .filter((s: { canonical: string; aliases: string[] }) => s.canonical.length > 0)
    : [];

  const mustSet = new Set<string>((data.mustHaves || []).map((m: string) => canon(m)));
  const niceSet = new Set<string>((data.niceToHaves || []).map((n: string) => canon(n)));
  const uniqueCanon = new Set<string>(skillsArr.map((s: { canonical: string; aliases: string[] }) => s.canonical));

  // Ensure all must/nice tokens exist in skills[]
  for (const m of mustSet) if (!uniqueCanon.has(m)) skillsArr.push({ canonical: m, aliases: [] });
  for (const n of niceSet) if (!uniqueCanon.has(n)) skillsArr.push({ canonical: n, aliases: [] });

  return {
    title: data.title || "",
    minYears: typeof data.minYears === "number" ? data.minYears : undefined,
    education: data.education || undefined,
    skills: skillsArr,
    mustHaveSet: mustSet,
    niceToHaveSet: niceSet,
  } as JobSpec;
}

/**
 * Candidate-specific questions based on JD spec + candidate resume text.
 */
export async function generateQuestionsForCandidate(spec: JobSpec, candidateText: string): Promise<string[]> {
  const schema = {
    type: "object",
    properties: { questions: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 6 } },
    required: ["questions"],
  };

  const topSkills = Array.from(spec.mustHaveSet || []).slice(0, 6).join(", ");
  const prompt = `
ROLE: ${spec.title || "N/A"}
MUST-HAVE THEMES: ${topSkills || "(derived from JD)"}

CANDIDATE RESUME (raw text):
"""${candidateText.slice(0, 12000)}"""

Create 5-6 INTERVIEW QUESTIONS tailored to THIS candidate for THIS role.
Blend functional/technical questions with behavioral/situational prompts.
Questions must reference the candidate's own background where appropriate (projects, tools, responsibilities).
Return JSON: { "questions": ["...", "..."] }
`;

  const model = await modelForJSON(schema, 0.4);
  const res = await withRetry(() => model.generateContent(prompt), "candidate-questions");
  const data = JSON.parse(res.response.text()) as { questions?: string[] };
  return Array.isArray(data.questions) ? data.questions.slice(0, 6) : [];
}
