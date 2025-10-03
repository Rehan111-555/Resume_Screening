// utils/geminiClient.server.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const key = process.env.GOOGLE_AI_API_KEY;
if (!key) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");

const genAI = new GoogleGenerativeAI(key);

// Prefer fast model; fall back to pro if needed
const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-pro"] as const;
let cachedModel: string | null = null;

async function getModelId(): Promise<string> {
  if (cachedModel) return cachedModel;
  for (const id of MODEL_CANDIDATES) {
    try {
      await genAI.getGenerativeModel({ model: id }).generateContent("ping");
      cachedModel = id;
      return id;
    } catch {
      /* try next */
    }
  }
  throw new Error(`No enabled Gemini model found. Enable one of: ${MODEL_CANDIDATES.join(", ")}`);
}

function toInlinePart(bytes: Buffer, mimeType: string) {
  return { inlineData: { data: bytes.toString("base64"), mimeType } };
}

// Minimal wait
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let err: any;
  for (let i = 0; i < 2; i++) {
    try {
      return await fn();
    } catch (e: any) {
      err = e;
      await sleep(500 * (i + 1));
    }
  }
  throw new Error(`${label}: ${String(err?.message || err)}`);
}

function tryParse<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const stripped = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(stripped) as T; } catch {}
  const m = stripped.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

async function repairJson(raw: string): Promise<any> {
  const model = genAI.getGenerativeModel({ model: await getModelId() });
  const prompt = `You will be given invalid JSON text. Return ONLY valid JSON that best matches the author's intent. No commentary.

RAW:
${raw}`;
  const res = await withRetry(() => model.generateContent(prompt), "repair-json");
  const text = res.response.text();
  return tryParse(text);
}

/* ---------------- Types ---------------- */
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
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;
  matchScore: number;      // 0..100
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions: string[];     // <-- per-candidate interview questions
};

/* ---------------- Prompts ---------------- */

// Extract a structured Resume Profile from file
function buildProfilePrompt(filename: string) {
  return `
You are a senior resume parser. Read the attached document "${filename}" and return ONLY valid JSON with this shape:

{
  "name": "string (required)",
  "email": "string",
  "phone": "string",
  "location": "string",
  "title": "string",
  "skills": ["string", "..."],
  "summary": "string",
  "education": [{"degree":"","field":"","institution":"","start":"","end":""}],
  "experience": [{"title":"","company":"","start":"","end":"","summary":""}]
}

Notes:
- Extract dates as simple strings (e.g. "Mar 2021", "2020-09").
- If unknown, use "" (empty string) or [] for arrays.
- No markdown, no comments — JSON only.
`;
}

// Full candidate analysis strictly against job description
function buildCandidateAnalysisPrompt(job: any, profile: ResumeProfile) {
  const jd = `
JOB TITLE: ${job?.title ?? ""}
JOB DESCRIPTION:
${job?.description ?? ""}

SCORING PRINCIPLES:
- Use ONLY the job description and the candidate profile below. Do not assume hidden requirements.
- Think like an experienced recruiter and hiring manager.
- Score 0..100 where 50 = neutral/partial fit, 80+ = strong fit.

RETURN JSON ONLY with this exact shape:
{
  "candidates": [
    {
      "id": "uuid-or-stable-id",
      "name": "string",
      "email": "string",
      "phone": "string",
      "location": "string",
      "title": "string",
      "yearsExperience": number,
      "education": "string (e.g., Bachelor of CS, 2020 — UET Lahore)",
      "skills": ["string", "..."],
      "summary": "1-3 sentences highlighting fit vs JD",
      "matchScore": number,       // 0..100
      "strengths": ["string", "..."],
      "weaknesses": ["string", "..."],
      "gaps": ["string", "..."],  // explicit evidence gaps vs JD
      "mentoringNeeds": ["string", "..."],
      "questions": ["string", "..."] // 5-7 tailored interview questions about THIS candidate
    }
  ]
}

Now analyze the candidate profile:

${JSON.stringify(profile, null, 2).slice(0, 8000)}
`;
  return jd;
}

/* ---------------- Public API ---------------- */

export async function extractProfileFromFile(file: { bytes: Buffer; mimeType: string; name: string }): Promise<ResumeProfile> {
  const model = genAI.getGenerativeModel({ model: await getModelId() });
  const res = await withRetry(
    () =>
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildProfilePrompt(file.name) },
              toInlinePart(file.bytes, file.mimeType),
            ],
          },
        ],
      }),
    "extract-profile"
  );

  const text = res.response.text();
  let parsed = tryParse<ResumeProfile>(text);
  if (!parsed) parsed = await repairJson(text);
  if (!parsed || !parsed.name) {
    // minimal safe shape
    return {
      name: file.name.replace(/\.(pdf|docx|png|jpe?g)$/i, "") || "Unknown",
      skills: [],
      education: [],
      experience: [],
      summary: "",
      title: "",
      email: "",
      phone: "",
      location: "",
    };
  }
  return parsed;
}

export async function analyzeProfileWithLLM(job: any, profile: ResumeProfile) {
  const model = genAI.getGenerativeModel({ model: await getModelId() });
  const res = await withRetry(
    () =>
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: buildCandidateAnalysisPrompt(job, profile) }],
          },
        ],
      }),
    "analyze-profile"
  );

  const text = res.response.text();
  let parsed = tryParse(text);
  if (!parsed) parsed = await repairJson(text);
  return parsed;
}
