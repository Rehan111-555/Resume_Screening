import { NextRequest, NextResponse } from "next/server";
import type { ResumeProfile, Candidate } from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------- helpers -------------------------- */

function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const run = queue.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}

// very permissive date parsing
function parseAnyDate(s?: string): Date | null {
  if (!s) return null;
  const clean = String(s).replace(/(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/, "$2/$1/$3"); // swap dd-mm-yyyy -> mm/dd/yyyy
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  // Try Month YYYY formats like "Sep 2021"
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
  if (e.getDate() >= s.getDate()) months += 0; // partial month tolerance
  return Math.max(0, months);
}

function totalExperienceMonths(exp?: { start?: string; end?: string }[]): number {
  if (!exp?.length) return 0;
  return exp.reduce((acc, item) => acc + monthsBetween(item.start, item.end), 0);
}

function simpleEducationString(edu?: any[]): string {
  if (!edu?.length) return "";
  const top = edu[0];
  const deg = [top?.degree, top?.field].filter(Boolean).join(", ");
  const inst = top?.institution ? ` (${top.institution})` : "";
  return (deg + inst).trim();
}

function eduLevelFit(required: string, eduStr: string): number {
  const r = (required || "").toLowerCase();
  const e = (eduStr || "").toLowerCase();
  const map: [string, number][] = [
    ["phd", 1], ["master", 0.85], ["msc", 0.85], ["bachelor", 0.7], ["bs", 0.7], ["bsc", 0.7],
    ["associate", 0.5], ["diploma", 0.4], ["high school", 0.2],
  ];
  for (const [k, v] of map) { if (r.includes(k) && e.includes(k)) return v; }
  if (r.includes("bachelor") && e) return 0.6;
  return e ? 0.4 : 0;
}

function skillsOverlap(required: string[], have?: string[]): { ratio: number; matched: string[]; missing: string[] } {
  const req = (required || []).map(s => s.toLowerCase().trim()).filter(Boolean);
  const hs = new Set((have || []).map(s => s.toLowerCase().trim()).filter(Boolean));
  const matched = req.filter(s => hs.has(s));
  const missing = req.filter(s => !hs.has(s));
  const ratio = req.length ? matched.length / req.length : 1;
  return { ratio, matched, missing };
}

// local score + strengths/weaknesses/gaps
function localAnalysis(job: any, profile: ResumeProfile) {
  const months = totalExperienceMonths(profile.experience);
  const years = months / 12;
  const eduStr = simpleEducationString(profile.education);
  const eduFit = eduLevelFit(job.educationLevel || "", eduStr);
  const { ratio: skillRatio, matched, missing } = skillsOverlap(job.requiredSkills || [], profile.skills);

  const expFit = Math.min(1, job.minYearsExperience ? years / job.minYearsExperience : 1);
  const overall = 0.4 * skillRatio + 0.3 * expFit + 0.2 * eduFit + 0.1 * 0.7;

  const strengths = [
    ...(matched.length ? [`Good alignment on required skills: ${matched.slice(0,8).join(", ")}`] : []),
    ...(years ? [`Relevant experience: ~${years.toFixed(1)} years`] : []),
    ...(eduStr ? [`Education: ${eduStr}`] : []),
  ];

  const weaknesses = [
    ...(missing.length ? [`Missing/weak skills: ${missing.slice(0,8).join(", ")}`] : []),
    ...(job.minYearsExperience && years < job.minYearsExperience
      ? [`Experience below required ${job.minYearsExperience}y (has ~${years.toFixed(1)}y)`] : []),
  ];

  const gaps = [...missing.map(m => `Skill gap: ${m}`)];
  const mentoring = missing.slice(0,3).map(m => `Mentorship in ${m}`);

  return {
    months,
    years,
    eduStr,
    score: Math.round(overall * 100),
    strengths,
    weaknesses,
    gaps,
    mentoring,
    skillPct: Math.round(skillRatio * 100),
  };
}

function safeParse<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const fenced = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(fenced) as T; } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

// fallback local questions
function localQuestions(job: any) {
  const skills: string[] = (job.requiredSkills || []).slice(0,6);
  const technical = skills.slice(0,4).map(s => `Describe a real project where you used ${s}. What was the hardest bug and how did you solve it?`);
  while (technical.length < 4) technical.push(`Walk me through a difficult technical decision you made related to ${job.title}.`);

  const educational = [
    `How has your formal education prepared you for a ${job.title} role?`,
    `Tell us about an advanced topic you studied and how you've applied it at work.`,
    `What recent learning (course/book) most improved your ${skills[0] || "core"} skills?`,
  ];

  const situational = [
    `You join a team with legacy code and a 2-week deadline. How do you plan, de-risk, and deliver?`,
    `A stakeholder asks for a feature that conflicts with constraints. How do you align and negotiate trade-offs?`,
    `A production incident appears linked to a dependency change. How do you investigate and prevent recurrence?`,
  ];

  return { technical, educational, situational };
}

/* -------------------------- route -------------------------- */

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const jobRequirements = JSON.parse(jrRaw);

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json({ error: "No resumes uploaded (field name must be 'resumes')." }, { status: 400 });
    }

    const files = await Promise.all(
      resumeFiles.map(async (f) => ({
        name: f.name || "resume",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const { extractProfileFromFile, analyzeProfileWithLLM, generateQuestions } = await import("@/utils/geminiClient.server");

    const limit = createLimiter(6);

    // 1) Extract a profile for every file (never drop)
    const profiles = await Promise.all(files.map(file =>
      limit(async () => {
        try {
          const prof = await extractProfileFromFile(file);
          if (!prof?.name) prof.name = file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") || "Unknown";
          return { file, profile: prof };
        } catch {
          return {
            file,
            profile: {
              name: file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") || "Unknown",
              skills: [], education: [], experience: [], title: "", email: "", phone: "", location: "", summary: "",
            } as ResumeProfile,
          };
        }
      })
    ));

    // 2) Analyze each profile with LLM; enrich/repair locally as needed
    const candidates: Candidate[] = [];
    const errors: { file: string; message: string }[] = [];

    for (const { file, profile } of profiles) {
      let candidateFromLLM: any = null;
      try {
        const a = await analyzeProfileWithLLM(jobRequirements, profile);
        const parsed = safeParse(a) || a;
        candidateFromLLM = parsed?.candidates?.[0] || null;
      } catch (e: any) {
        errors.push({ file: file.name, message: "LLM analysis failed; using local scoring." });
      }

      // Local analysis (for experience & score) — used both as fallback and to correct missing fields
      const la = localAnalysis(jobRequirements, profile);

      const cand: Candidate = {
        id: (candidateFromLLM?.id) || crypto.randomUUID(),
        name: candidateFromLLM?.name || profile.name || file.name,
        email: candidateFromLLM?.email || profile.email || "",
        phone: candidateFromLLM?.phone || profile.phone || "",
        location: candidateFromLLM?.location || profile.location || "",
        title: candidateFromLLM?.title || profile.title || "",
        yearsExperience: Number(
          (candidateFromLLM?.yearsExperience ?? la.years).toFixed(2)
        ),
        education: candidateFromLLM?.education || simpleEducationString(profile.education),
        skills: (candidateFromLLM?.skills && candidateFromLLM.skills.length ? candidateFromLLM.skills : (profile.skills || [])),
        summary: candidateFromLLM?.summary || profile.summary || "",
        matchScore: Number(
          (candidateFromLLM?.matchScore ?? la.score)
        ),
        strengths: candidateFromLLM?.strengths?.length ? candidateFromLLM.strengths : la.strengths,
        weaknesses: candidateFromLLM?.weaknesses?.length ? candidateFromLLM.weaknesses : la.weaknesses,
        gaps: candidateFromLLM?.gaps?.length ? candidateFromLLM.gaps : la.gaps,
        mentoringNeeds: candidateFromLLM?.mentoringNeeds?.length ? candidateFromLLM.mentoringNeeds : la.mentoring,
      };

      // Ensure arrays
      cand.skills ||= []; cand.strengths ||= []; cand.weaknesses ||= []; cand.gaps ||= []; cand.mentoringNeeds ||= [];

      candidates.push(cand);
    }

    // 3) Sort DESC by score (top first)
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // 4) Questions — LLM first, fallback to local templates
    let questions = { technical: [], educational: [], situational: [] as string[] };
    try {
      const top = candidates.slice(0, Math.min(3, candidates.length));
      const qRaw = await generateQuestions(jobRequirements, top);
      const qParsed = safeParse(qRaw);
      if (qParsed?.technical?.length || qParsed?.educational?.length || qParsed?.situational?.length) {
        questions = {
          technical: qParsed.technical || [],
          educational: qParsed.educational || [],
          situational: qParsed.situational || [],
        };
      } else {
        questions = localQuestions(jobRequirements);
        errors.push({ file: "questions", message: "LLM questions empty → using local templates." });
      }
    } catch {
      questions = localQuestions(jobRequirements);
      errors.push({ file: "questions", message: "LLM questions failed → using local templates." });
    }

    return NextResponse.json({ candidates, questions, errors });
  } catch (err: any) {
    return NextResponse.json({ error: "Resume analysis failed", details: String(err?.message || err) }, { status: 500 });
  }
}
