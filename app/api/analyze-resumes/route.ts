// app/api/analyze-resumes/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { ResumeProfile, Candidate } from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------------- helpers -------------------------------- */

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

function safeParse<T = any>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch {}
  const stripped = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(stripped) as T; } catch {}
  const m = stripped.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

/* --------------------------------- route --------------------------------- */

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

    const { extractProfileFromFile, analyzeProfileWithLLM } = await import("@/utils/geminiClient.server");
    const limit = createLimiter(6);

    // 1) extract profiles
    const profiles = await Promise.all(
      files.map((file) =>
        limit(async () => {
          try {
            const profile = await extractProfileFromFile(file);
            if (!profile?.name) profile.name = file.name.replace(/\.(pdf|docx|png|jpe?g)$/i, "") || "Unknown";
            return { file, profile };
          } catch {
            const p: ResumeProfile = {
              name: file.name.replace(/\.(pdf|docx|png|jpe?g)$/i, "") || "Unknown",
              skills: [],
              education: [],
              experience: [],
              title: "",
              email: "",
              phone: "",
              location: "",
              summary: "",
            };
            return { file, profile: p };
          }
        })
      )
    );

    // 2) LLM analysis ONLY (no local heuristics)
    const candidates: Candidate[] = [];
    const errors: { file: string; message: string }[] = [];

    for (const { file, profile } of profiles) {
      try {
        const raw = await analyzeProfileWithLLM(jobRequirements, profile);
        const parsed = safeParse(raw) || raw;
        const c = parsed?.candidates?.[0];

        // Normalize minimal shape if LLM misses fields
        const candidate: Candidate = {
          id: c?.id || crypto.randomUUID(),
          name: c?.name || profile.name || file.name,
          email: c?.email || profile.email || "",
          phone: c?.phone || profile.phone || "",
          location: c?.location || profile.location || "",
          title: c?.title || profile.title || "",
          yearsExperience: Number(c?.yearsExperience ?? 0),
          education: c?.education || "",
          skills: Array.isArray(c?.skills) ? c.skills : (profile.skills || []),
          summary: c?.summary || profile.summary || "",
          matchScore: Math.max(0, Math.min(100, Number(c?.matchScore ?? 0))),
          strengths: Array.isArray(c?.strengths) ? c.strengths : [],
          weaknesses: Array.isArray(c?.weaknesses) ? c.weaknesses : [],
          gaps: Array.isArray(c?.gaps) ? c.gaps : [],
          mentoringNeeds: Array.isArray(c?.mentoringNeeds) ? c.mentoringNeeds : [],
          questions: Array.isArray(c?.questions) ? c.questions : [],
        };

        candidates.push(candidate);
      } catch (e: any) {
        errors.push({ file: file.name, message: `LLM analysis failed: ${String(e?.message || e)}` });
        // Still include a minimal candidate so results grid keeps order
        candidates.push({
          id: crypto.randomUUID(),
          name: profile.name || file.name,
          email: profile.email || "",
          phone: profile.phone || "",
          location: profile.location || "",
          title: profile.title || "",
          yearsExperience: 0,
          education: "",
          skills: profile.skills || [],
          summary: profile.summary || "",
          matchScore: 0,
          strengths: [],
          weaknesses: [],
          gaps: [],
          mentoringNeeds: [],
          questions: [],
        });
      }
    }

    // 3) sort by matchScore
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // Return ONLY candidates (each has their own questions)
    return NextResponse.json({ candidates, errors });
  } catch (err: any) {
    return NextResponse.json({ error: "Resume analysis failed", details: String(err?.message || err) }, { status: 500 });
  }
}
