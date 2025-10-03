// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { UICandidate, ResumeProfile } from "@/utils/geminiClient.server";
import {
  extractJobSignals,
  extractProfileFromFile,
  scoreCandidate,
  questionsForCandidate,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
// Allow longer than default; 300s is common ceiling on many plans.
// If your project/plan supports more, you can try 600 or 900.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Tune this to fit under your maxDuration with headroom:
const MAX_FILES_PER_REQUEST = 3;         // ← IMPORTANT
const MAX_TOTAL_UPLOAD_MB = 200;         // be kind to serverless memory
const CONCURRENCY = 3;                   // parallel LLM calls without spiking duration

function limiter(max: number) {
  let active = 0;
  const q: Array<() => void> = [];
  const next = () => { active--; const run = q.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>(res => q.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}
function toYears(months: number) { return +(months / 12).toFixed(2); }

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const job = JSON.parse(jrRaw);

    const resumeFiles = (form.getAll("resumes") as File[]) || [];
    if (!resumeFiles.length) return NextResponse.json({ error: "No resumes uploaded." }, { status: 400 });

    // Size guardrails
    const totalBytes = resumeFiles.reduce((n, f) => n + (f.size || 0), 0);
    const totalMB = totalBytes / (1024 * 1024);
    if (totalMB > MAX_TOTAL_UPLOAD_MB) {
      return NextResponse.json({ error: `Total upload exceeds ${MAX_TOTAL_UPLOAD_MB}MB.` }, { status: 400 });
    }

    // Cap files per request to keep wall-time under maxDuration
    const sliced = resumeFiles.slice(0, MAX_FILES_PER_REQUEST);
    const truncatedCount = resumeFiles.length - sliced.length;

    const files = await Promise.all(
      sliced.map(async f => ({
        name: f.name || "resume",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      }))
    );

    // 1) JD → competency signals (fast call)
    const signals = await extractJobSignals(job);

    // 2) Extract profiles in parallel (limited)
    const run = limiter(CONCURRENCY);
    const profiles: { file: string; profile: ResumeProfile }[] = [];
    await Promise.all(files.map(file =>
      run(async () => {
        const profile = await extractProfileFromFile(file);
        profiles.push({ file: file.name, profile });
      })
    ));

    // 3) Score + per-candidate questions (limited)
    const candidates: UICandidate[] = [];
    await Promise.all(profiles.map(({ file, profile }) =>
      run(async () => {
        const rs = scoreCandidate(job, signals, profile);
        const edu = (profile.education && profile.education.length)
          ? [profile.education[0]?.degree || "", profile.education[0]?.institution || ""].filter(Boolean).join(", ")
          : "";

        let qs: string[] = [];
        try { qs = await questionsForCandidate(job, profile); } catch { /* non-fatal */ }

        candidates.push({
          id: crypto.randomUUID(),
          name: profile.name || file,
          email: profile.email || "",
          phone: profile.phone || "",
          location: profile.location || "",
          title: profile.title || "",
          yearsExperience: toYears((profile.experience || []).reduce((n, x) => {
            const s = x.start ? new Date(x.start) : null;
            const e = x.end ? new Date(x.end) : new Date();
            if (!s || isNaN(+s) || !e || isNaN(+e)) return n;
            return n + Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
          }, 0)),
          education: edu,
          skills: profile.skills || [],
          summary: profile.summary || "",
          matchScore: rs.overall,
          strengths: rs.strengths,
          weaknesses: rs.weaknesses,
          gaps: rs.gaps,
          mentoringNeeds: rs.mentoring,
          questions: qs,
        });
      })
    ));

    candidates.sort((a, b) => b.matchScore - a.matchScore);

    const elapsed = Date.now() - t0;
    return NextResponse.json({
      candidates,
      questions: { technical: [], educational: [], situational: [] },
      errors: truncatedCount > 0 ? [
        { type: "batch", message: `Processed first ${sliced.length} of ${resumeFiles.length} files to stay within server limits. Please re-run with the remaining ${truncatedCount} file(s).` }
      ] : [],
      meta: { elapsedMs: elapsed, cappedAt: MAX_FILES_PER_REQUEST }
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Resume analysis failed", details: String(e?.message || e) }, { status: 500 });
  }
}
