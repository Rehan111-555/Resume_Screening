import { NextRequest, NextResponse } from "next/server";
import type { JobRequirements, Candidate, AnalysisResult } from "@/types";
import {
  extractJobSpec,
  generateDynamicSchemaFromJD,
  extractProfileToDynamicSchema,
  generateQuestionsForCandidate,
} from "@/utils/geminiClient.server";

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

/* ----------------------- fuzzy helpers for scoring -------------- */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s\+\.#&]/g, " ").replace(/\s+/g, " ").trim();
}
function fuzzyHas(haystack: string, phrase: string): boolean {
  const H = " " + normalize(haystack) + " ";
  const n = normalize(phrase);
  if (!n) return false;
  if (H.includes(` ${n} `)) return true;
  if (H.includes(n)) return true;
  const L = n.length;
  for (let i = 0; i <= H.length - L; i++) {
    let d = 0; for (let j = 0; j < L && d <= 1; j++) if (H[i + j] !== n[j]) d++;
    if (d <= 1) return true;
  }
  return false;
}
function estimateYearsFromText(text: string): number | undefined {
  const m = text.toLowerCase().match(/(\d{1,2})(\s*\+)?\s*(years|yrs|yr)/);
  if (!m) return undefined;
  return parseInt(m[1], 10);
}

function scoreAgainstSpec(
  spec: Awaited<ReturnType<typeof extractJobSpec>>,
  resumeText: string
) {
  const canonicalGroups = (spec.skills || []).map(g => ({
    canon: String(g.canonical || "").toLowerCase(),
    aliases: (g.aliases || []).map(a => String(a).toLowerCase()),
  }));

  const must = canonicalGroups.filter(g => spec.mustHaveSet?.has(g.canon));
  const nice = canonicalGroups.filter(g => spec.niceToHaveSet?.has(g.canon));

  const covered = (group: { canon: string; aliases: string[] }) => {
    if (fuzzyHas(resumeText, group.canon)) return true;
    return group.aliases.some(a => fuzzyHas(resumeText, a));
    };

  const mustMatches = must.filter(covered);
  const niceMatches = nice.filter(covered);

  const mustCoverage = must.length ? mustMatches.length / must.length : 1;
  const niceCoverage = nice.length ? niceMatches.length / nice.length : 1;

  // Experience proxy
  const years = estimateYearsFromText(resumeText) ?? 0;
  let expScore = 1;
  if (spec.minYears) expScore = Math.max(0, Math.min(1, years / spec.minYears));

  const overall = 0.6 * mustCoverage + 0.2 * niceCoverage + 0.2 * expScore;
  const missing = must.filter(m => !mustMatches.includes(m)).map(m => m.canon);

  return {
    years,
    matchScore: Math.round(overall * 100),
    matchedSkills: Array.from(new Set([...mustMatches, ...niceMatches].map(m => m.canon))),
    missingSkills: missing,
    strengths: [
      ...(mustMatches.length ? [`Strong alignment on key requirements: ${mustMatches.map(m => m.canon).slice(0,8).join(", ")}`] : []),
      ...(years ? [`Relevant experience: ~${years.toFixed(1)} years`] : []),
    ],
    weaknesses: [
      ...(missing.length ? [`Missing/weak vs must-haves: ${missing.slice(0,8).join(", ")}`] : []),
      ...(spec.minYears && years < spec.minYears ? [`Experience below required ${spec.minYears}y (has ~${years.toFixed(1)}y)`] : []),
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

    // 1) Build role-aware spec + a dynamic JSON Schema from the JD
    const jdText = `${job.title}\n\n${job.description}`;
    const [spec, schema] = await Promise.all([
      extractJobSpec(jdText),
      generateDynamicSchemaFromJD(jdText),
    ]);

    // 2) Parse + score resumes
    const limit = createLimiter(10);
    const candidates: Candidate[] = [];

    await Promise.all(
      resumeFiles.map(file =>
        limit(async () => {
          const text = await extractTextFromFile(file);

          // Fill the AI-designed schema with data from the resume
          let structured: any = {};
          try {
            structured = await extractProfileToDynamicSchema(schema, text);
          } catch {
            structured = {};
          }

          const s = scoreAgainstSpec(spec, text);
          const questions = await generateQuestionsForCandidate(spec, text).catch(() => []);

          candidates.push({
            id: crypto.randomUUID(),
            name: structured?.identity?.fullName || structured?.name || file.name.replace(/\.(pdf|docx|doc|txt)$/i, ""),
            email: structured?.contact?.email || "",
            phone: structured?.contact?.phone || "",
            location: structured?.location || "",
            title: structured?.identity?.currentTitle || "",
            yearsExperience: Number((s.years ?? 0).toFixed(2)),
            education: Array.isArray(structured?.education) && structured.education.length
              ? `${structured.education[0]?.degree || ""} ${structured.education[0]?.field || ""}`.trim()
              : "",
            skills: Array.isArray(structured?.competencies) ? structured.competencies : s.matchedSkills,
            summary: structured?.summary || text.slice(0, 500).replace(/\s+/g, " "),
            matchScore: s.matchScore,
            strengths: s.strengths,
            weaknesses: s.weaknesses,
            gaps: s.gaps,
            mentoringNeeds: s.mentoringNeeds,
            questions,
            dynamicProfile: structured, // full structured profile generated from the AI schema
          });
        })
      )
    );

    // 3) Sort
    candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // 4) Return everything, including the generated schema for transparency/debugging
    const payload: AnalysisResult = {
      candidates,
      questions: { technical: [], educational: [], situational: [] },
      meta: { dynamicSchema: schema, jobSpec: { ...spec, mustHaveSet: undefined, niceToHaveSet: undefined } }, // sets aren’t serializable
    };
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Resume analysis failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
