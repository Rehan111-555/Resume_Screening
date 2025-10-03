// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Candidate } from "@/types";
import {
  extractProfileFromFile,
  extractJobSignals,
  analyzeOneCandidate,
  safeParse,
  type ResumeProfile,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------- concurrency limiter ------------- */
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

/* --------- date helpers (experience calc fallback) --------- */
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
  const months = exp.reduce((acc, item) => acc + monthsBetween(item.start, item.end), 0);
  return months / 12;
}

/* ---------------------- route ---------------------- */
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

    // normalize files
    const files = await Promise.all(
      resumeFiles.map(async (f) => ({
        name: f.name || "resume",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const limit = createLimiter(6);
    const errors: { file: string; message: string }[] = [];

    // --- 1) Extract JD signals (role-agnostic) ---
    let signals;
    try {
      signals = await extractJobSignals(jobRequirements);
    } catch (e: any) {
      return NextResponse.json(
        { error: "extract-jobspec", details: String(e?.message || e) },
        { status: 500 }
      );
    }

    // --- 2) Extract profiles for all files ---
    const profs = await Promise.all(
      files.map((file) =>
        limit(async () => {
          try {
            const profile = await extractProfileFromFile(file);
            if (!profile?.name) profile.name = file.name.replace(/\.(pdf|docx|doc|png|jpg|jpeg)$/i, "") || "Unknown";
            return { file, profile };
          } catch (e: any) {
            errors.push({ file: file.name, message: "Profile extraction failed; using empty fallback." });
            const fallback: ResumeProfile = {
              name: file.name.replace(/\.(pdf|docx|doc|png|jpg|jpeg)$/i, "") || "Unknown",
              email: "",
              phone: "",
              location: "",
              title: "",
              skills: [],
              summary: "",
              education: [],
              experience: [],
            };
            return { file, profile: fallback };
          }
        })
      )
    );

    // --- 3) LLM per-candidate analysis (questions included) ---
    const candidates: Candidate[] = [];
    for (const { file, profile } of profs) {
      try {
        // ensure yearsExperience present
        const yearsFromDates = totalExperienceYears(profile.experience);
        const cand = await analyzeOneCandidate(jobRequirements, signals, profile);
        if ((!cand.yearsExperience || cand.yearsExperience < 0.1) && yearsFromDates > 0) {
          cand.yearsExperience = Number(yearsFromDates.toFixed(2));
        }
        candidates.push(cand);
      } catch (e: any) {
        errors.push({ file: file.name, message: `LLM analysis failed: ${String(e?.message || e)}` });
      }
    }

    // --- 4) Sort by match score DESC ---
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // --- 5) Build a small global questions bucket from top-3 candidate sets ---
    const topQs = candidates
      .slice(0, Math.min(3, candidates.length))
      .flatMap((c) => Array.isArray(c.questions) ? c.questions.slice(0, 4) : []);
    const questions = topQs.length
      ? {
          technical: topQs.slice(0, 4),
          educational: topQs.slice(4, 7),
          situational: topQs.slice(7, 10),
        }
      : undefined;

    return NextResponse.json({ candidates, questions, errors });
  } catch (err: any) {
    return NextResponse.json({ error: "Resume analysis failed", details: String(err?.message || err) }, { status: 500 });
  }
}
