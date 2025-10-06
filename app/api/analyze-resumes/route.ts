import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { convert } from "html-to-text";
import {
  llmExtractProfile,
  llmDeriveKeywords,
  scoreHeuristically,
  llmGradeCandidate,
  JDKeywords,
  mapEduLevel,
  eduFit,
  clamp01,
} from "@/utils/geminiClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ───────── file → plain text ───────── */
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

  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const html = buf.toString("utf8");
    return convert(html, { preserveNewlines: true, wordwrap: false }) || "";
  }

  // plain text fallback
  return buf.toString("utf8");
}

/** ───────── minimal fuzzy contains (no hardcoding) ───────── */
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9\+\.\-#& ]+/g, " ").replace(/\s+/g, " ").trim();
}
function fuzzyContains(longText: string, phrase: string): boolean {
  const T = " " + norm(longText) + " ";
  const p = norm(phrase);
  if (!p) return false;
  if (T.includes(` ${p} `)) return true;
  if (T.includes(p)) return true;
  // small char tolerance (lev<=1)
  const L = p.length;
  for (let i = 0; i <= T.length - L; i++) {
    let d = 0;
    for (let j = 0; j < L && d <= 1; j++) if (T[i + j] !== p[j]) d++;
    if (d <= 1) return true;
  }
  return false;
}

/** ───────── automatic domain anchors from JD ───────── */
function buildJdAnchors(keywords: JDKeywords): string[] {
  const must = Array.isArray(keywords?.must) ? keywords.must : [];
  const names = must.map((m) => (m?.name || "").trim()).filter(Boolean);
  return Array.from(new Set(names)).slice(0, 20);
}
function hitsFromResume(text: string, keywords: JDKeywords, anchors: string[]): string[] {
  const must = Array.isArray(keywords?.must) ? keywords.must : [];
  const byName = new Map<string, string[]>();
  for (const item of must) {
    const name = (item?.name || "").trim();
    if (!name) continue;
    byName.set(
      name,
      Array.from(new Set([name, ...(item?.synonyms || [])].map((s) => (s || "").trim()).filter(Boolean)))
    );
  }
  const found = new Set<string>();
  for (const anchor of anchors) {
    const syns = byName.get(anchor) || [anchor];
    if (syns.some((s) => fuzzyContains(text, s))) found.add(anchor);
  }
  return Array.from(found);
}

/** ───────── pretty years ───────── */
function formatYears(n: number): string {
  const y = Math.max(0, Number.isFinite(n) ? n : 0);
  if (y < 1) {
    const m = Math.round(y * 12);
    return `${m} month${m === 1 ? "" : "s"}`;
  }
  const whole = Math.floor(y);
  const rem = Math.round((y - whole) * 12);
  return rem > 0 ? `${whole} yr ${rem} mo` : `${whole} year${whole === 1 ? "" : "s"}`;
}

/** ───────── formatted block (your exact spec) ───────── */
function buildFormattedBlock(c: {
  name: string; email: string; phone: string; location: string; summary: string;
  matchScore: number; yearsExperience: number; skillsEvidencePct: number; education: string;
  skills: string[]; questions: string[];
  strengths: string[]; weaknesses: string[]; gaps: string[]; mentoringNeeds: string[];
}): string {
  const lines: string[] = [];
  const esc = (s: string) => (s || "").replace(/\s+/g, " ").trim();

  lines.push(`## Candidate Details — **${esc(c.name)}**\n`);
  lines.push(`**Personal Information**\n`);
  lines.push(`* Email: ${esc(c.email) || "Not specified"}`);
  lines.push(`* Phone: ${esc(c.phone) || "Not specified"}`);
  lines.push(`* Location: ${esc(c.location) || "Not specified"}\n`);
  lines.push(`**Professional Summary**\n${esc(c.summary) || "—"}\n`);
  lines.push(`**Match Breakdown**\n`);
  lines.push(`* **Overall Match:** ${c.matchScore}%`);
  lines.push(`* **Experience:** ${formatYears(c.yearsExperience)}`);
  lines.push(`* **Skills & Evidence:** ${c.skillsEvidencePct}%`);
  lines.push(`* **Education:** ${esc(c.education) || "—"}\n`);
  lines.push(`**Skills**\n${(c.skills || []).slice(0, 30).join(", ") || "—"}\n`);
  if ((c.questions || []).length) {
    lines.push(`**AI Interview Questions**\n${c.questions.map((q,i)=>`${i+1}. ${esc(q)}`).join(" ")}`);
  } else {
    lines.push(`**AI Interview Questions**\n—`);
  }
  lines.push(`\n**Strengths**\n${(c.strengths || []).map(s=>`* ${esc(s)}`).join("\n") || "—"}\n`);
  lines.push(`**Areas for Improvement**\n${(c.weaknesses || []).map(s=>`* ${esc(s)}`).join("\n") || "—"}\n`);
  lines.push(`**Identified Gaps (vs JD)**\n${(c.gaps || []).map(s=>`* ${esc(s)}`).join("\n") || "—"}\n`);
  lines.push(`**Mentoring Needs**\n${(c.mentoringNeeds || []).map(s=>`* ${esc(s)}`).join("\n") || "—"}\n`);
  return lines.join("\n");
}

/** ───────── limiter ───────── */
function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const run = queue.shift(); if (run) { active++; run(); } };
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) await new Promise<void>((res) => queue.push(res));
    active++; try { return await task(); } finally { next(); }
  };
}

/** ───────── local route types ───────── */
type JobRequirements = {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
};

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

    // JD keywords (auto, no hardcoding)
    const keywords = await llmDeriveKeywords(JD);
    const jdAnchors = buildJdAnchors(keywords);

    const limit = createLimiter(8);
    const errors: { file: string; message: string }[] = [];
    const candidates: any[] = [];

    await Promise.all(
      resumeFiles.map((f) =>
        limit(async () => {
          try {
            const text = await extractTextFromFile(f);
            if (!text.trim()) throw new Error("Empty/unsupported file content.");

            const [profile, llmRubric] = await Promise.all([
              llmExtractProfile(text),
              llmGradeCandidate(JD, text),
            ]);

            // Heuristic coverage (deterministic)
            const h = scoreHeuristically(text, keywords);
            const skillsEvidencePct = Math.round(h.coverage * 100);

            // Experience
            const years = Number(
              (profile?.yearsExperience || llmRubric?.yearsExperienceEstimate || 0).toFixed(2)
            );

            // Education
            const eduStr =
              Array.isArray(profile?.education) && profile.education.length
                ? [profile.education[0]?.degree, profile.education[0]?.field, profile.education[0]?.institution]
                    .filter(Boolean)
                    .join(", ")
                : (llmRubric?.educationSummary || "");
            const eduLabel = mapEduLevel(eduStr);
            const eduScore = eduFit(job.educationLevel, eduLabel);

            // Base score (before gating)
            const expFit = clamp01(job.minYearsExperience ? years / job.minYearsExperience : 1);
            const llmNorm = (llmRubric?.score || 0) / 100;
            const baseOverall = 0.55 * h.coverage + 0.25 * expFit + 0.1 * eduScore + 0.1 * llmNorm;
            let matchScore = Math.round(100 * clamp01(baseOverall));

            // ───── Automatic "domain" gate from JD anchors
            const resumeHits = hitsFromResume(text, keywords, jdAnchors);
            const minNeeded = Math.max(1, Math.ceil((keywords.must?.length || 0) * 0.15));
            let domainMatch = true;
            let domainNote = "";
            if ((keywords.must?.length || 0) > 0 && resumeHits.length < minNeeded) {
              domainMatch = false;
              matchScore = 0;
              domainNote = "Domain not matching";
            }

            // Skills merged (de-duped)
            const mergedSkills = Array.from(
              new Set<string>([
                ...(Array.isArray(profile?.skills) ? profile.skills : []).map(String),
                ...(Array.isArray(llmRubric?.matchedSkills) ? llmRubric.matchedSkills : []).map(String),
                ...h.matched,
              ].filter(Boolean).map((s) => s.trim()))
            );

            // Narrative
            const strengths = [
              ...(Array.isArray(llmRubric?.strengths) ? llmRubric.strengths : []),
              ...(h.matched.length ? [`Strong evidence for: ${h.matched.slice(0, 10).join(", ")}`] : []),
            ];
            const weaknesses = [
              ...(Array.isArray(llmRubric?.weaknesses) ? llmRubric.weaknesses : []),
              ...(h.missing.length ? [`Missing vs JD: ${h.missing.slice(0, 8).join(", ")}`] : []),
            ];

            const gaps = (h.missing || []).map((m: string) => `Skill gap: ${m}`);
            const mentoring = (h.missing || []).slice(0, 3).map((m: string) => `Mentorship in ${m}`);

            const candidateCore = {
              id: crypto.randomUUID(),
              name: profile?.name || f.name.replace(/\.(pdf|docx|doc|txt|html?)$/i, ""),
              email: profile?.email || "",
              phone: profile?.phone || "",
              location: profile?.location || "",
              title: profile?.headline || (profile?.experience?.[0]?.title || ""),
              yearsExperience: years,
              education: eduLabel || eduStr || "",
              skills: mergedSkills,
              summary: profile?.summary || text.slice(0, 500).replace(/\s+/g, " "),
              matchScore,
              skillsEvidencePct,
              strengths,
              weaknesses,
              gaps,
              mentoringNeeds: mentoring,
              questions: Array.isArray(llmRubric?.questions) ? llmRubric.questions : [],
              domainMatch,
              domainNote,
              domainFromJD: jdAnchors,
              domainFromResume: resumeHits,
            };

            const formatted = buildFormattedBlock(candidateCore);

            candidates.push({ ...candidateCore, formatted });
          } catch (e: any) {
            errors.push({ file: f.name, message: String(e?.message || e) });
          }
        })
      )
    );

    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    return NextResponse.json({ candidates, errors, meta: { keywords } });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
