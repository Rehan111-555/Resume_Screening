import { NextRequest, NextResponse } from "next/server";
import { convert } from "html-to-text";
import type { AnalysisResult, Candidate, JobRequirements } from "@/types";
import {
  llmExtractProfile,
  llmGradeCandidate,
  llmDeriveKeywords,
  scoreHeuristically,
  estimateYears,
  cleanTokens,
  mapEduLevel,
  eduFit,
  clamp01,
} from "@/utils/geminiClient.server";

// ---- parse utility ----------------------------------------------------------

async function fileToText(f: File): Promise<string> {
  // best-effort: if it's html-ish turn into text; else decode as utf-8
  const buf = new Uint8Array(await f.arrayBuffer());
  const sniff = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 2048));
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(sniff);
  if (isHtml) {
    return convert(new TextDecoder().decode(buf), { wordwrap: false });
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return ""; // last resort
  }
}

function safe(s?: any): string {
  const x = String(s ?? "").trim();
  return x;
}

// very small, robust domain match: if at least one “must” token or one of its synonyms
function domainOK(resumeText: string, jdMust: { name: string; synonyms: string[] }[]): boolean {
  if (!jdMust.length) return true;
  const hay = ` ${resumeText.toLowerCase().replace(/[^a-z0-9 +.#&]/g, " ")} `;
  for (const m of jdMust) {
    for (const syn of [m.name, ...m.synonyms]) {
      const p = ` ${syn.toLowerCase().trim()} `;
      if (hay.includes(p)) return true;
    }
  }
  return false;
}

function nonEmpty<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v.filter(Boolean as any) : [];
}

function makeFormattedBlock(c: Candidate): string {
  // short plain-text “copy as text”
  const bullets = (title: string, items: string[]) =>
    items.length ? `\n${title}\n- ${items.join("\n- ")}` : "";
  return [
    `## Candidate Details — ${c.name || "—"}`,
    `Email: ${c.email || "—"}`,
    `Phone: ${c.phone || "—"}`,
    `Location: ${c.location || "—"}`,
    "",
    `Summary:\n${c.summary || "—"}`,
    "",
    `Experience: ${c.yearsExperience || 0} years`,
    `Education: ${c.education || c.educationSummary || "—"}`,
    "",
    bullets("Skills", c.skills),
    bullets("Strengths", c.strengths),
    bullets("Areas for Improvement", c.weaknesses),
    bullets("Identified Gaps", c.gaps),
    bullets("Mentoring Needs", c.mentoringNeeds),
  ].join("\n");
}

// ---- API route --------------------------------------------------------------

export const runtime = "nodejs"; // make sure File & Buffer behave consistently

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const jdRaw = String(form.get("jobRequirements") || "{}");
    const jd: JobRequirements = JSON.parse(jdRaw);

    const files = form.getAll("resumes") as File[];
    if (!files.length) {
      return NextResponse.json({ candidates: [] } satisfies AnalysisResult, { status: 200 });
    }

    const jdText = [safe(jd.title), safe(jd.description)].filter(Boolean).join("\n");
    const kw = await llmDeriveKeywords(jdText).catch(() => ({ must: [], nice: [] }));

    const out: Candidate[] = [];

    for (const file of files) {
      // 1) raw text
      const rawText = (await fileToText(file)).slice(0, 16000);

      // 2) profile (LLM) with fallback
      const prof = (await llmExtractProfile(rawText).catch(() => null)) || {};
      const name = safe(prof.name);
      const email = safe(prof.email);
      const phone = safe(prof.phone);
      const location = safe(prof.location);
      const headline = safe(prof.headline);
      const summary =
        safe(prof.summary) ||
        // fallback: first paragraph of the resume text
        safe(rawText.split(/\n{2,}/)[0]).slice(0, 600);

      // 3) years & education
      const yearsLLM = Number(prof.yearsExperience || 0);
      const yearsHeu = estimateYears(rawText);
      const yearsExperience = Math.max(yearsLLM || 0, yearsHeu || 0);

      const edu = mapEduLevel(
        (Array.isArray(prof.education) && prof.education.map((e: any) => e?.degree || "").join(", ")) ||
          safe(prof.educationSummary)
      );

      const skills = cleanTokens(
        (Array.isArray(prof.skills) ? prof.skills : []).concat(
          Array.isArray(prof.tools) ? prof.tools : []
        )
      ).slice(0, 24);

      // 4) domain
      const okDomain = domainOK(rawText, kw.must);

      // 5) heuristic score + LLM grade (robust merge)
      const heur = scoreHeuristically(rawText, kw);
      let grade: any = {};
      try {
        grade = await llmGradeCandidate(jdText, rawText);
      } catch {
        grade = {};
      }

      const strengths = nonEmpty<string>(grade.strengths).slice(0, 8);
      const weaknesses = nonEmpty<string>(grade.weaknesses).slice(0, 8);
      const gaps = nonEmpty<string>(grade.missingSkills).slice(0, 8);
      const mentoringNeeds = nonEmpty<string>(grade.questions) // use questions as coaching prompts fallback
        .map((q) => q.replace(/\?+$/, ""))
        .slice(0, 6);

      const questions = okDomain ? nonEmpty<string>(grade.questions).slice(0, 6) : [];

      // 6) scores
      const skillsEvidencePct = Math.round(clamp01(heur.coverage) * 100);
      const yearsScore = clamp01(
        !jd.minYearsExperience ? 0.7 : Math.min(1, yearsExperience / Math.max(1, jd.minYearsExperience))
      );
      const eduScore = eduFit(jd.educationLevel, edu);

      // final blended match
      const match =
        0.55 * clamp01(heur.coverage) +
        0.25 * yearsScore +
        0.12 * eduScore +
        0.08 * (okDomain ? 1 : 0);
      const matchScore = Math.round(match * 100);

      const c: Candidate = {
        id: crypto.randomUUID(),
        name: name || headline || file.name.replace(/\.(pdf|docx?|txt)$/i, ""),
        email,
        phone,
        location,
        title: headline || "",
        yearsExperience,
        education: edu || "",
        skills,
        summary,

        matchScore,
        skillsEvidencePct,
        domainMismatch: !okDomain,

        strengths,
        weaknesses,
        gaps,
        mentoringNeeds,
        questions,

        educationSummary: edu || "",
      };

      c.formatted = makeFormattedBlock(c);
      out.push(c);
    }

    const payload: AnalysisResult = { candidates: out };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}
