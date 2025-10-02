import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import type { JobSpec, DynamicSchema } from "@/types";

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
const SYS = `You MUST return only valid JSON. No markdown. When unsure, use empty strings, 0, or [].`;

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
function tryParse<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

/* ======================= JOB SPEC (role-agnostic) ======================== */

export async function extractJobSpec(jdText: string): Promise<JobSpec> {
  const prompt = `
From the JOB DESCRIPTION below, build a compact JSON JobSpec.

Rules:
- Use concise, role-agnostic skill names ("accounts payable","vendor management","compliance testing",
  "customer service","excel","photoshop","typescript","graphql","procurement", etc.)
- For each important skill/requirement, include several ALIASES people write on resumes
  (abbreviations, synonyms, phrasing variants).
- Classify skills into mustHaves vs niceToHaves based on the JD emphasis.

Return ONLY JSON:
{
  "title": "string",
  "minYears": number | null,
  "education": "string | null",
  "mustHaves": ["skill","skill",...],
  "niceToHaves": ["skill",...],
  "skills": [
    { "canonical":"skill", "aliases":["alias1","alias2"] }
  ]
}

JOB DESCRIPTION:
"""${jdText}"""
`;
  const model = await jsonModel(0);
  const res = await withRetry(() => model.generateContent(prompt), "extract-jobspec");
  const data = tryParse<{
    title?: string;
    minYears?: number | null;
    education?: string | null;
    mustHaves?: string[];
    niceToHaves?: string[];
    skills?: { canonical?: string; aliases?: string[] }[];
  }>(res.response.text()) || {};

  const canon = (x: string) => String(x || "").toLowerCase();

  const skillsArr: { canonical: string; aliases: string[] }[] = Array.isArray(data.skills)
    ? data.skills
        .map((s) => ({
          canonical: canon(s?.canonical || ""),
          aliases: (s?.aliases || []).map((a) => canon(a)),
        }))
        .filter((s) => s.canonical.length > 0)
    : [];

  const mustSet = new Set<string>((data.mustHaves || []).map((m) => canon(m)));
  const niceSet = new Set<string>((data.niceToHaves || []).map((n) => canon(n)));
  const uniqueCanon = new Set<string>(skillsArr.map((s) => s.canonical));

  Array.from(mustSet).forEach((m) => { if (!uniqueCanon.has(m)) skillsArr.push({ canonical: m, aliases: [] }); });
  Array.from(niceSet).forEach((n) => { if (!uniqueCanon.has(n)) skillsArr.push({ canonical: n, aliases: [] }); });

  return {
    title: data.title || "",
    minYears: typeof data.minYears === "number" ? data.minYears : undefined,
    education: data.education || undefined,
    skills: skillsArr,
    mustHaveSet: mustSet,
    niceToHaveSet: niceSet,
  } as JobSpec;
}

/* ======================= DYNAMIC JSON SCHEMA ======================== */

/**
 * Generate a Draft 2020-12 JSON Schema tailored to the JOB DESCRIPTION.
 * The schema should capture the fields a recruiter would want for that role.
 */
export async function generateDynamicSchemaFromJD(jdText: string): Promise<DynamicSchema> {
  const prompt = `
You are a schema designer. Create a Draft 2020-12 JSON Schema that best captures information a recruiter needs
for the role described below. The schema MUST be self-contained and valid JSON.

Guidelines:
- type: "object" at the root, with clear property names.
- Include common top-level groups where applicable: identity, contact, summary, competencies/skills, tools,
  education (array), experience (array), certifications (array), achievements (array), languages (array),
  links (portfolio, github/behance/etc), location, availability, expectedCompensation (optional).
- Use appropriate types, arrays, enums (if JD hints), string patterns for email/phone/urls, and sensible defaults.
- Mark important fields as "required" when JD suggests must-haves (e.g., licenses for compliance roles).
- Keep keys in lowerCamelCase. Avoid role-specific jargon in key names where a generic term exists.

Return ONLY JSON of the schema.

JOB DESCRIPTION:
"""${jdText}"""
`;
  const model = await jsonModel(0);
  const res = await withRetry(() => model.generateContent(prompt), "dynamic-schema");
  const schema = tryParse<DynamicSchema>(res.response.text()) || {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "CandidateProfile",
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  };
  return schema;
}

/**
 * Extract a candidate profile that CONFORMS to the supplied schema.
 * The model should normalize values (dates, urls) and fill best-effort defaults where missing.
 */
export async function extractProfileToDynamicSchema(schema: DynamicSchema, resumeText: string): Promise<any> {
  const schemaStr = JSON.stringify(schema);
  const prompt = `
Fill the following JSON Schema with data extracted from the resume text.
- Return ONLY a JSON INSTANCE (no markdown) that VALIDLY conforms to the schema.
- Use best-effort normalization (e.g., ISO dates "YYYY-MM", emails, phone in international format).
- Where the resume doesn't provide a field, use "", 0, false, or [] as appropriate to keep it valid.

SCHEMA:
${schemaStr}

RESUME TEXT:
"""${resumeText.slice(0, 16000)}"""
`;
  const model = await jsonModel(0);
  const res = await withRetry(() => model.generateContent(prompt), "extract-to-schema");
  const inst = tryParse<any>(res.response.text()) || {};
  return inst;
}

/* ======================= TAILORED QUESTIONS ======================== */

export async function generateQuestionsForCandidate(spec: JobSpec, candidateText: string): Promise<string[]> {
  const topSkills = Array.from(spec.mustHaveSet || []).slice(0, 6).join(", ");
  const prompt = `
ROLE: ${spec.title || "N/A"}
MUST-HAVE THEMES: ${topSkills || "(derived from JD)"}

CANDIDATE RESUME (raw text):
"""${candidateText.slice(0, 12000)}"""

Create 5–6 INTERVIEW QUESTIONS tailored to THIS candidate for THIS role.
Blend functional/technical questions with behavioral/situational prompts.
Questions should reference the candidate’s own background where appropriate (projects, tools, responsibilities).

Return ONLY JSON:
{ "questions": ["...", "..."] }
`;
  const model = await jsonModel(0.4);
  const res = await withRetry(() => model.generateContent(prompt), "candidate-questions");
  const data = tryParse<{ questions?: string[] }>(res.response.text()) || {};
  return Array.isArray(data.questions) ? data.questions.slice(0, 6) : [];
}
