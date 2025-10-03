import { NextRequest, NextResponse } from "next/server";
import type { UICandidate, ResumeProfile } from "@/utils/geminiClient.server";
import {
  extractJobSignals,
  extractProfileFromFile,
  scoreCandidate,
  questionsForCandidate,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// concurrency limiter
function limiter(max: number) {
  let active = 0;
  const q: Array<() => void> = [];
  const next = () => { active--; const run = q.shift(); if (run) { active++; run(); } };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(res => q.push(res));
    active++;
    try { return await task(); } finally { next(); }
  };
}

function toYears(months: number) { return +(months/12).toFixed(2); }

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const job = JSON.parse(jrRaw);

    // ---- size & count guardrails to 100 files / 500MB total ----
    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) return NextResponse.json({ error: "No resumes uploaded." }, { status: 400 });
    if (resumeFiles.length > 100) return NextResponse.json({ error: "Max 100 resumes per batch." }, { status: 400 });

    let totalBytes = 0;
    resumeFiles.forEach(f => totalBytes += f.size || 0);
    if (totalBytes > 500 * 1024 * 1024) return NextResponse.json({ error: "Total upload limit is 500MB." }, { status: 400 });

    const files = await Promise.all(
      resumeFiles.map(async f => ({
        name: f.name || "resume",
        mimeType: f.type || "application/octet-stream",
        bytes: Buffer.from(await f.arrayBuffer()),
      }))
    );

    // 1) JD → competency signals (must/nice + synonyms)
    const signals = await extractJobSignals(job);

    // 2) Extract profiles in parallel (limited)
    const run = limiter(6);
    const profiles: { file: string; profile: ResumeProfile }[] = [];
    for (const file of files) {
      profiles.push({
        file: file.name,
        profile: await run(() => extractProfileFromFile(file)),
      });
    }

    // 3) Score + per-candidate questions
    const candidates: UICandidate[] = [];
    for (const { file, profile } of profiles) {
      const rs = scoreCandidate(job, signals, profile);

      const edu = (profile.education && profile.education.length)
        ? [profile.education[0]?.degree || "", profile.education[0]?.institution || ""].filter(Boolean).join(", ")
        : "";

      let qs: string[] = [];
      try {
        qs = await run(() => questionsForCandidate(job, profile));
      } catch { /* non-fatal */ }

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
          return n + Math.max(0, (e.getFullYear()-s.getFullYear())*12 + (e.getMonth()-s.getMonth()));
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
    }

    // sort by overall
    candidates.sort((a,b) => b.matchScore - a.matchScore);

    // 4) Return
    return NextResponse.json({
      candidates,
      questions: { technical: [], educational: [], situational: [] }, // kept for UI compatibility
      errors: [],
    });

  } catch (e: any) {
    return NextResponse.json({ error: "Resume analysis failed", details: String(e?.message || e) }, { status: 500 });
  }
}
