import { NextRequest, NextResponse } from "next/server";
import type { ResumeProfile, Candidate } from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------- helpers -------------------------- */

function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

// permissive date parsing
function parseAnyDate(s?: string): Date | null {
  if (!s) return null;
  const clean = String(s).replace(
    /(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/,
    "$2/$1/$3"
  ); // swap dd-mm-yyyy -> mm/dd/yyyy
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
  let months =
    (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() >= s.getDate()) months += 0; // partial month tolerance
  return Math.max(0, months);
}

function totalExperienceMonths(
  exp?: { start?: string; end?: string }[]
): number {
  if (!exp?.length) return 0;
  return exp.reduce((acc, item) => acc + monthsBetween(item.start, item.end), 0);
}

function totalExperienceYears(exp?: { start?: string; end?: string }[]): number {
  return totalExperienceMonths(exp) / 12;
}

function simpleEducationString(edu?: any[]): string {
  if (!edu?.length) return "";
  const top = edu[0];
  const deg = [top?.degree, top?.field].filter(Boolean).join(", ");
  const inst = top?.institution ? ` (${top.institution})` : "";
  return (deg + inst).trim();
}

function safeParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {}
  const fenced = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(fenced) as T;
  } catch {}
  const m = raw.match(/\{[\s\S]*\}$/);
  if (m) {
    try {
      return JSON.parse(m[0]) as T;
    } catch {}
  }
  return null;
}

/* ---------- fallback interview questions ---------- */
type QuestionSets = { technical: string[]; educational: string[]; situational: string[] };

function localQuestions(job: any): QuestionSets {
  const title = job?.title || "this role";
  const technical = [
    `Can you describe a real project that best demonstrates your fit for ${title}? What was your role and the hardest problem you solved?`,
    `Walk through a time you optimized performance or quality. What baseline, approach, and measurable outcome did you achieve?`,
    `Describe an integration or dependency you owned. How did you manage risks, versioning, and testing?`,
    `Tell me about a time you debugged a tricky issue end-to-end. How did you isolate the root cause?`,
  ];
  const educational = [
    `How has your education or training directly prepared you for ${title}?`,
    `Share an advanced topic you studied that you later applied at work. What changed in your practice?`,
    `What recent learning (course/book) most improved your core skills for this job?`,
  ];
  const situational = [
    `You inherit legacy work and a tight deadline. How do you scope, de-risk, and deliver?`,
    `A stakeholder asks for a feature that conflicts with constraints. How do you negotiate trade-offs?`,
    `An incident appears linked to a dependency change. How do you investigate and prevent recurrence?`,
  ];
  return { technical, educational, situational };
}

/* --------------------- local scoring --------------------- */
/** Heuristic score when LLM can’t or to sanity-check LLM output.
 *  It compares resume skills against **job description text only**.
 */
function localScore(job: any, profile: ResumeProfile) {
  const years = totalExperienceYears(profile.experience);
  const jd = (job.description || "").toLowerCase();

  const skills = (profile.skills || [])
    .map((s) => (s || "").toString().toLowerCase().trim())
    .filter(Boolean);

  // FIX: avoid iterating Set directly (ts target issue)
  let skillHits = 0;
  const uniqSkills = Array.from(new Set(skills));
  for (let i = 0; i < uniqSkills.length; i++) {
    if (jd.includes(uniqSkills[i])) skillHits++;
  }

  const skillRatio = skills.length
    ? Math.min(1, skillHits / Math.max(3, skills.length / 2))
    : 0.2;

  const expFit = job.minYearsExperience
    ? Math.min(1, years / job.minYearsExperience)
    : Math.min(1, years / 3);

  const eduStr = simpleEducationString(profile.education);
  const eduFit = eduStr ? 0.7 : 0.3;

  const score = Math.round(
    (0.5 * skillRatio + 0.35 * expFit + 0.15 * eduFit) * 100
  );

  const strengths: string[] = [];
  if (years) strengths.push(`Relevant experience: ~${years.toFixed(1)} years`);
  if (eduStr) strengths.push(`Education: ${eduStr}`);
  if (skillHits >= 1) strengths.push(`Evidence aligns with JD keywords`);

  const weaknesses: string[] = [];
  if (job.minYearsExperience && years < job.minYearsExperience) {
    weaknesses.push(
      `Experience below required ${job.minYearsExperience}y (has ~${years.toFixed(
        1
      )}y)`
    );
  }
  if (skillHits === 0 && skills.length) {
    weaknesses.push(`Skills present but not explicitly reflected in the JD text`);
  }

  return { years, eduStr, score, strengths, weaknesses };
}

/* -------------------------- route -------------------------- */

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json(
        { error: "Missing jobRequirements (stringified JSON)." },
        { status: 400 }
      );
    }
    const jobRequirements = JSON.parse(jrRaw);

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json(
        { error: "No resumes uploaded (field name must be 'resumes')." },
        { status: 400 }
      );
    }

    const files = await Promise.all(
      resumeFiles.map(async (f) => ({
        name: f.name || "resume",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const {
      extractProfileFromFile,
      analyzeProfileWithLLM,
      generateQuestions,
    } = await import("@/utils/geminiClient.server");

    // limit concurrency so Vercel edge/node doesn’t choke
    const limit = createLimiter(6);

    // 1) Extract a profile for every file (never drop a candidate)
    const profiles = await Promise.all(
      files.map((file) =>
        limit(async () => {
          try {
            const prof = await extractProfileFromFile(file);
            if (!prof?.name)
              prof.name =
                file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") || "Unknown";
            return { file, profile: prof };
          } catch {
            return {
              file,
              profile: {
                name:
                  file.name.replace(/\.(pdf|docx|png|jpg|jpeg)$/i, "") ||
                  "Unknown",
                skills: [],
                education: [],
                experience: [],
                title: "",
                email: "",
                phone: "",
                location: "",
                summary: "",
              } as ResumeProfile,
            };
          }
        })
      )
    );

    // 2) Analyze each profile with LLM; enrich/repair locally as needed
    const candidates: Candidate[] = [];
    const errors: { file: string; message: string }[] = [];

    for (const { file, profile } of profiles) {
      let candidateFromLLM: any = null;
      try {
        // LLM compares strictly against job description (not a required skills list)
        const a = await analyzeProfileWithLLM(jobRequirements, profile);
        const parsed = safeParse(a) || a;
        candidateFromLLM = parsed?.candidates?.[0] || null;
      } catch {
        errors.push({
          file: file.name,
          message: "LLM analysis failed; using local scoring.",
        });
      }

      // Local analysis to ensure we always have reasonable numbers
      const la = localScore(jobRequirements, profile);

      const cand: Candidate = {
        id: candidateFromLLM?.id || crypto.randomUUID(),
        name: candidateFromLLM?.name || profile.name || file.name,
        email: candidateFromLLM?.email || profile.email || "",
        phone: candidateFromLLM?.phone || profile.phone || "",
        location: candidateFromLLM?.location || profile.location || "",
        title: candidateFromLLM?.title || profile.title || "",
        yearsExperience: Number(
          (candidateFromLLM?.yearsExperience ?? la.years).toFixed(2)
        ),
        education:
          candidateFromLLM?.education || la.eduStr || simpleEducationString(profile.education),
        skills:
          (candidateFromLLM?.skills && candidateFromLLM.skills.length
            ? candidateFromLLM.skills
            : profile.skills || []) ?? [],
        summary: candidateFromLLM?.summary || profile.summary || "",
        matchScore: Number(candidateFromLLM?.matchScore ?? la.score),
        strengths:
          candidateFromLLM?.strengths?.length
            ? candidateFromLLM.strengths
            : la.strengths,
        weaknesses:
          candidateFromLLM?.weaknesses?.length
            ? candidateFromLLM.weaknesses
            : la.weaknesses,
        gaps: candidateFromLLM?.gaps?.length ? candidateFromLLM.gaps : [],
        mentoringNeeds: candidateFromLLM?.mentoringNeeds?.length
          ? candidateFromLLM.mentoringNeeds
          : [],
      };

      // normalize arrays
      cand.skills ||= [];
      cand.strengths ||= [];
      cand.weaknesses ||= [];
      cand.gaps ||= [];
      cand.mentoringNeeds ||= [];

      candidates.push(cand);
    }

    // 3) Sort DESC by score (top first)
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // 4) Questions — LLM first, fallback to local templates
    let questions: QuestionSets = { technical: [], educational: [], situational: [] };
    try {
      const top = candidates.slice(0, Math.min(3, candidates.length));
      const qRaw = await generateQuestions(jobRequirements, top);
      const qParsed = safeParse(qRaw);
      if (
        qParsed?.technical?.length ||
        qParsed?.educational?.length ||
        qParsed?.situational?.length
      ) {
        questions = {
          technical: qParsed.technical || [],
          educational: qParsed.educational || [],
          situational: qParsed.situational || [],
        };
      } else {
        questions = localQuestions(jobRequirements);
        errors.push({
          file: "questions",
          message: "LLM questions empty → using local templates.",
        });
      }
    } catch {
      questions = localQuestions(jobRequirements);
      errors.push({
        file: "questions",
        message: "LLM questions failed → using local templates.",
      });
    }

    return NextResponse.json({ candidates, questions, errors });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
