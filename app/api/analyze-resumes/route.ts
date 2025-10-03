// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { ResumeProfile, Candidate } from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- helpers ---------------- */
function parseAnyDate(s?: string): Date | null {
  if (!s) return null;
  const clean = String(s).replace(/(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/, "$2/$1/$3");
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  const m = clean.match(/([A-Za-z]{3,})\s+(\d{4})/);
  if (m) {
    const dt = new Date(`${m[1]} 1, ${m[2]}`);
    if (!isNaN(dt.getTime())) return dt;
  }
  return null;
}

function monthsBetween(start?: string, end?: string): number {
  const s = parseAnyDate(start);
  const e = parseAnyDate(end) || new Date();
  if (!s || !e) return 0;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, months);
}

function totalExperienceYears(exp?: { start?: string; end?: string }[]): number {
  if (!exp?.length) return 0;
  const months = exp.reduce((acc, x) => acc + monthsBetween(x.start, x.end), 0);
  return +(months / 12).toFixed(2);
}

function simpleEducationString(edu?: any[]): string {
  if (!edu?.length) return "";
  const top = edu[0];
  const deg = [top?.degree, top?.field].filter(Boolean).join(", ");
  const inst = top?.institution ? ` (${top.institution})` : "";
  return (deg + inst).trim();
}

function localScore(job: any, profile: ResumeProfile) {
  const years = totalExperienceYears(profile.experience);
  // Heuristic match from JD text + basic profile evidence (no requiredSkills field)
  const jd = (job.description || "").toLowerCase();
  const skills = (profile.skills || []).map(s=>s.toLowerCase());

  let skillHits = 0;
  for (const k of new Set(skills)) if (jd.includes(k)) skillHits++;

  const skillRatio = skills.length ? Math.min(1, skillHits / Math.max(3, skills.length / 2)) : 0.2;
  const expFit = job.minYearsExperience ? Math.min(1, years / job.minYearsExperience) : Math.min(1, years / 3);
  const eduStr = simpleEducationString(profile.education);
  const eduFit = eduStr ? 0.7 : 0.3;

  const score = Math.round((0.5 * skillRatio + 0.35 * expFit + 0.15 * eduFit) * 100);
  return { years, eduStr, score };
}

function mergeCandidate(llm: any, profile: ResumeProfile, job: any): Candidate {
  const base = localScore(job, profile);

  const years = Math.max(Number(llm?.yearsExperience || 0), base.years);
  const skills = Array.from(new Set([
    ...(Array.isArray(llm?.skills) ? llm.skills : []),
    ...(profile.skills || []),
  ]));

  const strengths = (Array.isArray(llm?.strengths) && llm.strengths.length ? llm.strengths : []);
  const weaknesses = (Array.isArray(llm?.weaknesses) && llm.weaknesses.length ? llm.weaknesses : []);
  const gaps = (Array.isArray(llm?.gaps) && llm.gaps.length ? llm.gaps : []);
  const mentoring = (Array.isArray(llm?.mentoringNeeds) && llm.mentoringNeeds.length ? llm.mentoringNeeds : []);
  const questions = (Array.isArray(llm?.interviewQuestions) && llm.interviewQuestions.length ? llm.interviewQuestions : []);

  // Never let a dubious 0 overwrite an evidence-based score
  const llmScore = Number(llm?.matchScore || 0);
  const score = Math.max(base.score, llmScore);

  return {
    id: llm?.id || crypto.randomUUID(),
    name: llm?.name || profile.name || "Unknown",
    email: llm?.email || profile.email || "",
    phone: llm?.phone || profile.phone || "",
    location: llm?.location || profile.location || "",
    title: llm?.title || profile.title || "",
    yearsExperience: +years.toFixed(2),
    education: llm?.education || base.eduStr || "",
    skills,
    summary: llm?.summary || profile.summary || "",
    matchScore: score,
    strengths,
    weaknesses,
    gaps,
    mentoringNeeds: mentoring,
    interviewQuestions: questions,
  };
}

/* ---------------- route ---------------- */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const job = JSON.parse(jrRaw);

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json({ error: "No resumes uploaded (field name must be 'resumes')." }, { status: 400 });
    }

    const files = await Promise.all(
      resumeFiles.map(async (f) => ({
        name: f.name || "resume",
        mimeType: f.type || "application/pdf",
        bytes: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const { extractProfileFromFile, analyzeProfileWithLLM } = await import("@/utils/geminiClient.server");

    // Extract profiles (parallel, but bounded by Node/Vercel naturally)
    const extracted = await Promise.all(files.map(async (file) => {
      try {
        const profile = await extractProfileFromFile(file);
        if (!profile?.name) profile.name = file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") || "Unknown";
        return { file, profile };
      } catch {
        return {
          file,
          profile: { name: file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") || "Unknown", skills: [], education: [], experience: [], summary: "" } as ResumeProfile,
        };
      }
    }));

    const candidates: Candidate[] = [];
    const errors: { file: string; message: string }[] = [];

    for (const { file, profile } of extracted) {
      let llmCand: any = null;
      try {
        const raw = await analyzeProfileWithLLM(job, profile);
        const parsed = safeParse(raw);
        llmCand = parsed?.candidates?.[0] || null;
      } catch (e: any) {
        errors.push({ file: file.name, message: `LLM analysis failed: ${String(e?.message || e)}` });
      }

      const merged = mergeCandidate(llmCand || {}, profile, job);
      candidates.push(merged);
    }

    // sort top first
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // Build a small global “questions” block as before (optional)
    const questions = {
      technical: candidates[0]?.interviewQuestions?.slice(0, 4) || [],
      educational: [],
      situational: [],
    };

    return NextResponse.json({ candidates, questions, errors });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

/* local JSON parser identical to utils but scoped here */
function safeParse<T=any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const unf = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(unf) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}
