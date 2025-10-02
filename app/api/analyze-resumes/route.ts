import { NextRequest, NextResponse } from "next/server";
import type { JobRequirements, Candidate, AnalysisResult, JobSpec } from "@/types";
import { extractJobSpec, generateQuestionsForCandidate } from "@/utils/geminiClient.server";

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

/* ----------------------- normalization/fuzzy -------------------- */
const STOP = new Set(["and","or","of","a","an","the","with","for","to","in","on","at","by","from"]);
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s\+\.#&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(ing|ed|es|s)\b/g, "");
}
function fuzzyHas(haystack: string, phrase: string): boolean {
  const H = " " + normalize(haystack) + " ";
  const n = normalize(phrase);
  if (!n) return false;
  if (H.includes(` ${n} `)) return true;    // exact word/phrase boundary
  if (H.includes(n)) return true;           // substring
  // tiny typo tolerance (Levenshtein within 1 over small windows)
  const L = n.length;
  for (let i = 0; i <= H.length - L; i++) {
    let d = 0;
    for (let j = 0; j < L && d <= 1; j++) if (H[i + j] !== n[j]) d++;
    if (d <= 1) return true;
  }
  return false;
}

/* ----------------------- profile + scoring ---------------------- */
type CandidateProfile = {
  name: string;
  text: string;
  yearsExperience?: number;
  education?: string;
};

function estimateYearsFromText(text: string): number | undefined {
  const m = text.toLowerCase().match(/(\d{1,2})(\s*\+)?\s*(years|yrs|yr)/);
  if (!m) return undefined;
  return parseInt(m[1], 10);
}
function extractEducation(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes("phd")) return "PhD";
  if (t.includes("master")) return "Master";
  if (t.includes("bachelor") || t.includes("bsc") || t.includes("bs")) return "Bachelor";
  if (t.includes("high school")) return "High School";
  return undefined;
}
function buildProfile(rawText: string, fallbackName: string): CandidateProfile {
  const header = (rawText.split(/\r?\n/).map(s => s.trim()).find(Boolean) || "").slice(0, 80);
  return {
    name: header || fallbackName.replace(/\.(pdf|docx|doc|txt)$/i, ""),
    text: rawText,
    yearsExperience: estimateYearsFromText(rawText),
    education: extractEducation(rawText),
  };
}

function scoreAgainstSpec(spec: JobSpec, p: CandidateProfile) {
  const text = p.text || "";
  const canonicalGroups = (spec.skills || []).map(g => ({
    canon: String(g.canonical || "").toLowerCase(),
    aliases: (g.aliases || []).map((a: string) => String(a).toLowerCase()),
  }));

  const must = canonicalGroups.filter(g => spec.mustHaveSet?.has(g.canon));
  const nice = canonicalGroups.filter(g => spec.niceToHaveSet?.has(g.canon));

  const covered = (group: { canon: string; aliases: string[] }) => {
    if (!group.canon) return false;
    if (fuzzyHas(text, group.canon)) return true;
    return group.aliases.some(a => fuzzyHas(text, a));
  };

  const mustMatches = must.filter(covered);
  const niceMatches = nice.filter(covered);

  const mustCoverage = must.length ? mustMatches.length / must.length : 1;
  const niceCoverage = nice.length ? niceMatches.length / nice.length : 1;

  let expScore = 1;
  if (spec.minYears) {
    const have = p.yearsExperience ?? 0;
    expScore = Math.max(0, Math.min(1, have / spec.minYears));
  }

  const overall = 0.6 * mustCoverage + 0.2 * niceCoverage + 0.2 * expScore;

  const missing = must.filter(m => !mustMatches.includes(m)).map(m => m.canon);

  return {
    matchScore: Math.round(overall * 100),
    matchedSkills: Array.from(new Set([...mustMatches, ...niceMatches].map(m => m.canon))),
    missingSkills: missing,
    strengths: [
      ...(mustMatches.length ? [`Strong alignment on key requirements: ${mustMatches.map(m => m.canon).slice(0,8).join(", ")}`] : []),
      ...(typeof p.yearsExperience === "number" ? [`Relevant experience: ~${p.yearsExperience.toFixed(1)} years`] : []),
      ...(p.education ? [`Education: ${p.education}`] : []),
    ],
    weaknesses: [
      ...(missing.length ? [`Missing/weak vs must-haves: ${missing.slice(0,8).join(", ")}`] : []),
      ...(spec.minYears && (p.yearsExperience ?? 0) < spec.minYears
        ? [`Experience below required ${spec.minYears}y (has ~${(p.yearsExperience ?? 0).toFixed(1)}y)`] : []),
    ],
    gaps: missing.map(m => `Skill gap: ${m}`),
    mentoringNeeds: missing.slice(0,3).map(m => `Mentorship in ${m}`),
  };
}

/* ---------------------------- route ---------------------------- */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jrRaw = form.get("jobRequirements");
    if (!jrRaw || typeof jrRaw !== "string") {
      return NextResponse.json({ error: "Missing jobRequirements (stringified JSON)." }, { status: 400 });
    }
    const job: JobRequirements = JSON.parse(jrRaw);

    const resumeFiles = form.getAll("resumes") as File[];
    if (!resumeFiles.length) {
      return NextResponse.json({ error: "No resumes uploaded (field name must be 'resumes')." }, { status: 400 });
    }

    // 1) Build a **generic role-aware spec** from the JD (includes synonyms per skill)
    const spec: JobSpec = await extractJobSpec(`${job.title}\n\n${job.description}`);

    // 2) Parse + score resumes quickly
    const limit = createLimiter(10);
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map(file =>
        limit(async () => {
          const text = await extractTextFromFile(file);
          const profile = buildProfile(text, file.name);
          const s = scoreAgainstSpec(spec, profile);

          const base: Candidate = {
            id: crypto.randomUUID(),
            name: profile.name,
            email: "",
            phone: "",
            location: "",
            title: "",
            yearsExperience: Number((profile.yearsExperience ?? 0).toFixed(2)),
            education: profile.education || "",
            skills: s.matchedSkills,
            summary: text.slice(0, 500).replace(/\s+/g, " "),
            matchScore: s.matchScore,
            strengths: s.strengths,
            weaknesses: s.weaknesses,
            gaps: s.gaps,
            mentoringNeeds: s.mentoringNeeds,
            questions: [], // filled below
          };

          // Generate **candidate-specific questions** (JD spec + this resume)
          try {
            base.questions = await generateQuestionsForCandidate(spec, text);
          } catch {
            base.questions = [
              `Walk me through a recent project most relevant to this role.`,
              `Which accomplishment best matches "${spec.title || job.title}" and why?`,
              `Describe a difficult stakeholder or customer situation you handled.`,
            ];
          }

          candidates.push(base);
        })
      )
    );

    // 3) Sort
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // 4) Return — keep questions object for type compatibility; not used by UI
    const payload: AnalysisResult = {
      candidates,
      questions: { technical: [], educational: [], situational: [] },
    };
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
