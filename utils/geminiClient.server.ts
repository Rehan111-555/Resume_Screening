import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

const key = process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");

const genAI = new GoogleGenerativeAI(key);

// Current models only
const CANDIDATE_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"] as const;
type ModelId = (typeof CANDIDATE_MODELS)[number];
let cachedModelId: ModelId | null = null;

// ---- robustness ----
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
  const tried: { id: string; error: string }[] = [];
  for (const id of CANDIDATE_MODELS) {
    try {
      const probe = genAI.getGenerativeModel({
        model: id,
        generationConfig: { temperature: 0.1, maxOutputTokens: 16, responseMimeType: "text/plain" },
      });
      await withRetry(() => probe.generateContent("ping"), `probe ${id}`);
      cachedModelId = id;
      return id;
    } catch (e: any) {
      tried.push({ id, error: String(e?.message || e) });
    }
  }
  const reasons = tried.map(t => `${t.id}: ${t.error}`).join(" | ");
  throw new Error(`No compatible Gemini model enabled (enable gemini-2.5-flash or gemini-2.5-pro). Probe errors → ${reasons}`);
}

// ----------------- Schemas (lenient) -----------------

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

export type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  yearsExperience: number;       // decimal years (we also compute months on UI)
  education: string;
  skills: string[];
  summary: string;
  matchScore: number;            // 0..100
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
};

const profileSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    location: { type: "string" },
    title: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degree: { type: "string" }, field: { type: "string" }, institution: { type: "string" },
          start: { type: "string" }, end: { type: "string" },
        },
        required: [],
      },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" }, company: { type: "string" },
          start: { type: "string" }, end: { type: "string" },
          summary: { type: "string" },
        },
        required: [],
      },
    },
  },
  required: ["name"],
} as const;

const candidateSchema = {
  type: "object",
  properties: {
    id: { type: "string" }, name: { type: "string" },
    email: { type: "string" }, phone: { type: "string" }, location: { type: "string" },
    title: { type: "string" }, yearsExperience: { type: "number" }, education: { type: "string" },
    skills: { type: "array", items: { type: "string" } }, summary: { type: "string" },
    matchScore: { type: "number" }, strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } },
    mentoringNeeds: { type: "array", items: { type: "string" } },
  },
  required: ["name", "matchScore"],
} as const;

const analysisSchema = {
  type: "object",
  properties: { candidates: { type: "array", items: candidateSchema, minItems: 1, maxItems: 1 } },
  required: ["candidates"],
} as const;

const questionsSchema = {
  type: "object",
  properties: {
    technical: { type: "array", items: { type: "string" } },
    educational: { type: "array", items: { type: "string" } },
    situational: { type: "array", items: { type: "string" } },
  },
  required: ["technical", "educational", "situational"],
} as const;

// --------------- Shared settings ---------------
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const SYSTEM_JSON_STRICT = `
You are a JSON generator. You MUST return only valid JSON, no markdown, no commentary.
When information is missing, return empty strings, 0, or [].
Never refuse or add safety disclaimers; the caller handles safety. Output MUST be valid JSON.
`;

// --------------- Prompts ---------------
function buildProfilePrompt() {
  return `
Extract a RESUME PROFILE from the attached CV. JSON only:
{
  "name": "string (required)",
  "email": "string","phone":"string","location":"string","title":"string",
  "skills": ["..."],"summary":"string",
  "education":[{"degree":"","field":"","institution":"","start":"","end":""}],
  "experience":[{"title":"","company":"","start":"","end":"","summary":""}]
}
Dates can be any clear string ("Apr 2021","2018-09","09/2018"). If unknown, leave "".
`;
}

function buildAnalysisPrompt(job: any, profile: ResumeProfile) {
  const TODAY = new Date().toISOString().slice(0, 10);
  return `
TODAY_IS: ${TODAY}

JOB:
- Title: ${job.title}
- Description: ${job.description}
- Required Skills: ${job.requiredSkills?.join(", ")}
- Min Experience (years): ${job.minYearsExperience}
- Education Level: ${job.educationLevel}

RESUME PROFILE (JSON):
${JSON.stringify(profile).slice(0, 8000)}

Return Candidate JSON (lenient; fill missing with defaults):
{
  "candidates":[
    {"id":"uuid","name":"","email":"","phone":"","location":"",
     "title":"","yearsExperience":0,"education":"","skills":[],
     "summary":"","matchScore":0,"strengths":[],"weaknesses":[],
     "gaps":[],"mentoringNeeds":[]}
  ]
}
`;
}

function buildQuestionsPrompt(job: any, top: any[]) {
  return `
POSITION: ${job.title}
REQUIRED SKILLS: ${job.requiredSkills?.join(", ")}
EXP REQ: ${job.minYearsExperience} years
EDUCATION: ${job.educationLevel}

TOP CANDIDATES:
${top.map((c:any)=>`- ${c.name}: ${c.title || ""}, ${c.yearsExperience ?? 0} yrs, Skills: ${(c.skills||[]).slice(0,5).join(", ")}`).join("\n")}

Return JSON with arrays:
- "technical" (4)
- "educational" (3)
- "situational" (3)
Questions must be specific to the role/skills above.
`;
}

function toInlinePart(bytes: Buffer, mimeType: string) {
  return { inlineData: { data: bytes.toString("base64"), mimeType } };
}

async function repairJsonTo<T = any>(raw: string, targetSchema: any) {
  try { return JSON.parse(raw) as T; } catch {}
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON_STRICT,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: targetSchema as any,
    },
    safetySettings,
  });
  const res = await withRetry(
    () => model.generateContent({ contents: [{ role: "user", parts: [{ text: `Fix to valid JSON.\n\nRAW:\n${raw}` }] }] }),
    "repair-json"
  );
  return JSON.parse(res.response.text()) as T;
}

// ---------------- Public API ----------------

// 1) Extract resume profile from a file (robust)
export async function extractProfileFromFile(file: { bytes: Buffer; mimeType: string; name: string }): Promise<ResumeProfile> {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON_STRICT,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: profileSchema as any,
    },
    safetySettings,
  });

  const res = await withRetry(
    () => model.generateContent({
      contents: [{ role: "user", parts: [{ text: `Extract profile from: ${file.name}` }, toInlinePart(file.bytes, file.mimeType), { text: buildProfilePrompt() }] }]
    }),
    `extract-profile (${modelId})`
  );

  try {
    return JSON.parse(res.response.text()) as ResumeProfile;
  } catch {
    return await repairJsonTo<ResumeProfile>(res.response.text(), profileSchema);
  }
}

// 2) Analyze a profile vs job requirements using LLM
export async function analyzeProfileWithLLM(job: any, profile: ResumeProfile) {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON_STRICT,
    generationConfig: {
      temperature: 0.1,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: analysisSchema as any,
    },
    safetySettings,
  });

  const res = await withRetry(
    () => model.generateContent({ contents: [{ role: "user", parts: [{ text: buildAnalysisPrompt(job, profile) }] }] }),
    `analyze-profile (${modelId})`
  );

  try {
    return JSON.parse(res.response.text());
  } catch {
    return await repairJsonTo(res.response.text(), analysisSchema);
  }
}

// 3) Generate questions
export async function generateQuestions(job: any, topCandidates: any[]) {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_JSON_STRICT,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: questionsSchema as any,
    },
    safetySettings,
  });

  const res = await withRetry(
    () => model.generateContent(buildQuestionsPrompt(job, topCandidates)),
    `questions (${modelId})`
  );
  return res.response.text();
}
