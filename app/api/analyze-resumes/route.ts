// app/api/analyze-resumes/route.ts
import { NextResponse } from "next/server";
import {
  cleanTokens,
  domainSimilarity,
  estimateYears,
  llmDeriveKeywords,
  llmExtractProfile,
  llmGradeCandidate,
  scoreHeuristically,
  type JDKeywords,
} from "@/utils/geminiClient.server";
import type { AnalysisResult, Candidate, JobRequirements } from "@/types";

/** -----------------------------------------------------------
 *  Lightweight HTML → text (no html-to-text dependency)
 * ----------------------------------------------------------*/
function htmlToText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  const withNewlines = withoutStyles.replace(/<\/(p|div|section|li|br|h[1-6])>/gi, "\n");
  const stripped = withNewlines.replace(/<[^>]+>/g, " ");
  return stripped.replace(/\s+/g, " ").trim();
}

/** -----------------------------------------------------------
 *  File → Plain text (PDF, DOCX, TXT, HTML)
 *  (dynamic imports keep Next.js build happy)
 * ----------------------------------------------------------*/
async function fileToText(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const buf = await file.arrayBuffer();

  // PDF
  if (type.includes("pdf") || name.endsWith(".pdf")) {
    try {
      const pdfParse = (await import("pdf-parse")).default as any;
      const data = await pdfParse(Buffer.from(buf));
      const text = String(data?.text || "");
      if (text.trim()) return text;
    } catch (e) {
      // fall through
    }
  }

  // DOCX
  if (name.endsWith(".docx") || type.includes("officedocument.wordprocessingml.document")) {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
      if (value?.trim()) return value;
    } catch (e) {
      // fall through
    }
  }

  // HTML
  if (type.includes("html") || name.endsWith(".html") || name.endsWith(".htm")) {
    const txt = new TextDecoder().decode(new Uint8Array(buf));
    return htmlToText(txt);
  }

  // Plain/Text fallback (txt, rtf, md)
  if (
    type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".rtf")
  ) {
    return new TextDecoder().decode(new Uint8Array(buf));
  }

  // Absolute last resort: try to decode as UTF-8
  try {
    return new TextDecoder().decode(new Uint8Array(buf));
  } catch {
    return "";
  }
}

/** -----------------------------------------------------------
 *  Candidate base object – include every field your type expects
 * ----------------------------------------------------------*/
function baseCandidate(id: string): Candidate {
  return {
    id,
    name: "",
    email: "",
    phone: "",
    location: "",
    title: "",
    yearsExperience: 0,
    education: "",
    skills: [],
    summary: "",
    matchScore: 0,
    skillsEvidencePct: 0,
    domainMismatch: false,
    // computed in this route:
    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],
    matchedSkills: [],
    missingSkills: [],
    educationSummary: "",
    questions: [],
    yearsScore: 0,
    eduScore: 0,
    formatted: "",
  } as unknown as Candidate;
}

/** -----------------------------------------------------------
 *  POST /api/analyze-resumes
 * ----------------------------------------------------------*/
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const jd = JSON.parse(String(form.get("jobRequirements") || "{}")) as JobRequirements;
    const resumes = form.getAll("resumes").filter(Boolean) as File[];

    // make sure we can run without crashing if nothing arrives
    if (!resumes.length) {
      const payload: AnalysisResult = { candidates: [] };
      return NextResponse.json(payload, { status: 200 });
    }

    const jdText = [
      jd.role || "",
      jd.description || "",
      (jd.requiredSkills || []).join(" "),
      (jd.niceToHave || []).join(" "),
      jd.education || "",
      jd.domain || "",
    ].join("\n");

    // derive JD keywords and prepare for heuristic
    const kw: JDKeywords = await llmDeriveKeywords(jdText);

    // process each resume
    const outCandidates: Candidate[] = [];
    for (let i = 0; i < resumes.length; i++) {
      const file = resumes[i];
      const id = `${i + 1}-${file.name}`;
      const cand = baseCandidate(id);

      // 1) Extract text
      const rawText = await fileToText(file);
      const text = rawText?.trim() || "";

      // 2) Estimate years & domain similarity
      const yearsEst = estimateYears(text);
      cand.yearsExperience = isFinite(yearsEst) ? yearsEst : 0;

      const domainSim = domainSimilarity(jdText, text); // 0..1
      cand.domainMismatch = domainSim < 0.12; // tuned threshold

      // 3) Heuristic skills coverage vs JD
      const h = scoreHeuristically(text, kw);
      cand.skillsEvidencePct = Math.round(h.coverage * 100);
      cand.matchedSkills = cleanTokens(h.matched);
      cand.missingSkills = cleanTokens(h.missing);

      // 4) LLM profile & grading (guard against empty text)
      let profile: any = {};
      let grade: any = {};
      if (text.length > 50) {
        profile = await llmExtractProfile(text);
        grade = await llmGradeCandidate(jdText, text);
      }

      cand.name = profile.name || "";
      cand.email = profile.email || "";
      cand.phone = profile.phone || "";
      cand.location = profile.location || "";
      cand.title = profile.headline || "";
      cand.summary = profile.summary || "";
      cand.education = (profile.education?.[0]?.degree || "") || "";
      cand.skills = cleanTokens([...(profile.skills || []), ...(profile.tools || [])]);
      cand.strengths = cleanTokens(grade.strengths || []);
      cand.weaknesses = cleanTokens(grade.weaknesses || []);
      cand.questions = grade.questions || [];
      cand.educationSummary = String(grade.educationSummary || "");

      // score blend
      const domainScore = Math.max(0, Math.min(1, domainSim)) * 100;
      const yearsScore = Math.min(100, Math.round((cand.yearsExperience / Math.max(1, jd.minYears || 8)) * 100));
      cand.yearsScore = yearsScore;
      cand.eduScore = 0; // leave 0 unless you map against jd.education w/ mapEduLevel/eduFit

      const heuristicScore = Math.round(h.coverage * 100);
      const blended = Math.round(0.55 * heuristicScore + 0.25 * domainScore + 0.20 * yearsScore);
      cand.matchScore = Math.max(0, Math.min(100, blended));

      // formatted (for the Copy button)
      cand.formatted =
        `Name: ${cand.name || "-"}\n` +
        `Title: ${cand.title || "-"}\n` +
        `Email: ${cand.email || "-"} | Phone: ${cand.phone || "-"} | Location: ${cand.location || "-"}\n` +
        `Years: ${cand.yearsExperience} | Match: ${cand.matchScore}% | Skills&Evidence: ${cand.skillsEvidencePct}%\n\n` +
        `Summary:\n${cand.summary || "-"}\n\n` +
        `Skills:\n${cand.skills?.join(", ") || "-"}\n\n` +
        `Matched JD:\n${cand.matchedSkills.join(", ") || "-"}\n` +
        `Missing JD:\n${cand.missingSkills.join(", ") || "-"}`;

      // suggested mentoring/gaps from missing
      cand.gaps = cand.missingSkills.slice(0, 6).map((s) => `Skill gap: ${s}`);
      cand.mentoringNeeds = cand.missingSkills.slice(0, 3).map((s) => `Mentorship in ${s}`);

      outCandidates.push(cand);
    }

    // NOTE: your AnalysisResult does NOT contain 'jd', so we only return candidates
    const payload: AnalysisResult = { candidates: outCandidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze resumes" },
      { status: 500 }
    );
  }
}
