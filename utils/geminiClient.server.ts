// utils/geminiClient.server.ts
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

/**
 * IMPORTANT:
 *  - Keep payloads simple and valid: we do NOT pass responseSchema anymore (it’s what caused your 400s).
 *  - We still ask for JSON in the prompt and self-heal if the model returns loose text.
 *  - We always MERGE model output with local evidence, never overwrite local evidence with zeros.
 */

const KEY = process.env.GOOGLE_AI_API_KEY;
if (!KEY) throw new Error("Missing GOOGLE_AI_API_KEY in .env.local");

const genAI = new GoogleGenerativeAI(KEY);
const MODELS: ReadonlyArray<string> = ["gemini-2.5-flash", "gemini-2.5-pro"];

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

let cachedModel: string | null = null;

async function pickModel(): Promise<string> {
  if (cachedModel) return cachedModel;
  for (const id of MODELS) {
    try {
      await genAI.getGenerativeModel({
        model: id,
        generationConfig: { temperature: 0.1, maxOutputTokens: 8 },
      }).generateContent({ contents: [{ role: "user", parts: [{ text: "ping" }] }] });
      cachedModel = id;
      return id;
    } catch {}
  }
  throw new Error("No Gemini 2.5 model available (enable gemini-2.5-flash or gemini-2.5-pro).");
}

function toInlinePart(bytes: Buffer, mimeType: string) {
  return { inlineData: { data: bytes.toString("base64"), mimeType } };
}

/* --------------------- Types --------------------- */
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
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  // new: per-candidate questions
  interviewQuestions?: string[];
};

/* --------------------- JSON helpers --------------------- */
function safeJson<T=any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const unFenced = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(unFenced) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

/* --------------------- Prompts --------------------- */
function profilePrompt() {
  return `
You will receive a resume file. Extract a structured RESUME PROFILE as JSON only.

Return:
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "title": "string",
  "skills": ["..."],
  "summary": "string",
  "education": [{"degree":"","field":"","institution":"","start":"","end":""}],
  "experience": [{"title":"","company":"","start":"","end":"","summary":""}]
}

Notes:
- If a field is unknown, use "" or [].
- Do not include any text outside the JSON.`;
}

function analysisPrompt(job: any, profile: ResumeProfile) {
  const TODAY = new Date().toISOString().slice(0,10);
  return `
TODAY: ${TODAY}

JOB:
- Title: ${job.title}
- Description: ${job.description}
- Minimum years: ${job.minYearsExperience || 0}
- Education level: ${job.educationLevel || ""}

RESUME PROFILE:
${JSON.stringify(profile).slice(0, 9000)}

TASK: Produce a JSON object with one candidate analyzing STRICTLY against the JOB DESCRIPTION.
Think like a senior recruiter: assess true years of experience (infer from dates and text), core skills actually evidenced, education summary, and realistic match score (0..100).

Return JSON ONLY with the shape:
{
  "candidates":[
    {
      "id":"string",
      "name":"string",
      "email":"string",
      "phone":"string",
      "location":"string",
      "title":"string",
      "yearsExperience": number,
      "education": "string",
      "skills": ["..."],
      "summary": "string",
      "matchScore": number,
      "strengths": ["..."],
      "weaknesses": ["..."],
      "gaps": ["..."],
      "mentoringNeeds": ["..."],
      "interviewQuestions": ["...","...","...","...","...","..."]
    }
  ]
}

Rules:
- If you are not confident, still estimate but do not output 0 unless it is truly absent.
- Interview questions must be tailored to THIS candidate and THIS job.
`;
}

/* --------------------- Public API --------------------- */

export async function extractProfileFromFile(file: { bytes: Buffer; mimeType: string; name: string }): Promise<ResumeProfile> {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
    safetySettings,
  });

  const res = await model.generateContent({
    contents: [
      { role: "user", parts: [{ text: `Extract profile from resume file: ${file.name}` }] },
      { role: "user", parts: [toInlinePart(file.bytes, file.mimeType)] },
      { role: "user", parts: [{ text: profilePrompt() }] },
    ],
  });

  const text = res.response.text();
  return safeJson<ResumeProfile>(text) || {
    name: file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") || "Unknown",
    email: "", phone: "", location: "", title: "",
    skills: [], summary: "", education: [], experience: []
  };
}

export async function analyzeProfileWithLLM(job: any, profile: ResumeProfile) {
  const modelId = await pickModel();
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: { temperature: 0.15, maxOutputTokens: 2048, responseMimeType: "application/json" },
    safetySettings,
  });

  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: analysisPrompt(job, profile) }] }],
  });

  return res.response.text();
}
