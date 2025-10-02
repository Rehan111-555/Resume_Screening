import { NextRequest, NextResponse } from "next/server";
import { llmExtractProfile, llmGradeCandidate } from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------- concurrency -------------------------- */
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const run = queue.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}

/* ----------------------- text extraction ------------------------ */
async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const pdf = (await import("pdf-parse")).default;
    const res = await pdf(buf);
    return res.text || "";
  }
  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value || "";
  }
  return buf.toString("utf8");
}

/* ---------------------------- types ---------------------------- */
type JobRequirements = {
  title: string;
  description: string;
  requiredSkills?: string[];
  minYearsExperience?: number;
  educationLevel?: string;
};

type Candidate = {
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
  questions: string[];
};

type AnalysisResult = {
  candidates: Candidate[];
  questions: { technical: string[]; educational: string[]; situational: string[] };
  errors?: { file: string; message: string }[];
};

/* ---------------------------- route ---------------------------- */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const job: JobRequirements = JSON.parse(jrRaw);
    const JD = `${job.title || ""}\n\n${job.description || ""}`;

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json({ error: "No resumes uploaded (field name must be 'resumes')." }, { status: 400 });
    }
    if (resumeFiles.length > 100) {
      return NextResponse.json({ error: "Limit 100 resumes per batch." }, { status: 400 });
    }

    const limit = createLimiter(10);
    const errors: { file: string; message: string }[] = [];
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const text = await extractTextFromFile(f);
            const [profile, grade] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            const years = Number(profile?.yearsExperience || grade?.yearsExperienceEstimate || 0);
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : (grade?.educationSummary || "");

            const missing = Array.isArray(grade?.missingSkills) ? grade.missingSkills : [];
            const strengths = Array.isArray(grade?.strengths) ? grade.strengths : [];
            const weaknesses = Array.isArray(grade?.weaknesses) ? grade.weaknesses : [];

            candidates.push({
              id: crypto.randomUUID(),
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt)$/i, ""),
              email: profile?.email || "",
              phone: profile?.phone || "",
              location: profile?.location || "",
              title: profile?.headline || (profile?.experience?.[0]?.title || ""),
              yearsExperience: Number(years.toFixed(2)),
              education: eduStr,
              skills: Array.isArray(profile?.skills) ? profile.skills : Array.isArray(grade?.matchedSkills) ? grade.matchedSkills : [],
              summary: profile?.summary || text.slice(0, 500).replace(/\s+/g, " "),
              matchScore: Number(grade?.score || 0),
              strengths,
              weaknesses,
              gaps: missing.map((m: string) => `Skill gap: ${m}`),
              mentoringNeeds: missing.slice(0, 3).map((m: string) => `Mentorship in ${m}`),
              questions: Array.isArray(grade?.questions) ? grade.questions : [],
            });
          } catch (e: any) {
            errors.push({ file: f.name, message: String(e?.message || e) });
          }
        })
      )
    );

    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const result: AnalysisResult = {
      candidates,
      questions: { technical: [], educational: [], situational: [] }, // kept for compatibility
      errors,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
