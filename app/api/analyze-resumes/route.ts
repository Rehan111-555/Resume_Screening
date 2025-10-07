import { NextResponse } from "next/server";
import type { AnalysisResult, Candidate } from "@/types";
import {
  llmExtractProfile,
  llmGradeCandidate,
  llmDeriveKeywords,
  scoreHeuristically,
  domainSimilarity,
  mapEduLevel,
  clamp01,
} from "@/utils/geminiClient.server";

/** ──────────────────────────────────────────────────────────────
 *  Tiny helpers (no extra packages)
 *  ────────────────────────────────────────────────────────────── */

function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<\/(h[1-6]|li|tr)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  return s.replace(/\s+/g, " ").trim();
}

function bytesToText(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dec = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  let txt = dec.decode(u8);
  txt = txt.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ");
  return txt.replace(/\s+/g, " ").trim();
}

async function extractTextFromPdf(u8: Uint8Array): Promise<string> {
  try {
    const mod = await import("pdf-parse").catch(() => null as any);
    if (mod) {
      const pdfParse = (mod.default ?? mod) as (
        d: Buffer | Uint8Array
      ) => Promise<{ text: string }>;
      const res = await pdfParse(u8);
      return (res?.text || "").trim();
    }
  } catch {
    /* ignore, use fallback */
  }
  return bytesToText(u8);
}

/** No dependency DOCX fallback.
 *  For perfect results, install a DOCX parser later; this keeps deploys clean.
 */
async function extractTextFromDocx(u8: Uint8Array): Promise<string> {
  return bytesToText(u8);
}

function extOf(name = ""): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

async function fileToText(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  const mime = (f.type || "").toLowerCase();
  const ext = extOf(f.name);

  if (mime.includes("pdf") || ext === "pdf") return extractTextFromPdf(buf);
  if (ext === "docx" || mime.includes("officedocument")) return extractTextFromDocx(buf);

  const guess = bytesToText(buf);
  if (mime.includes("html") || ext === "html" || /<\/?[a-z][\s\S]*>/i.test(guess)) {
    return htmlToText(guess);
  }
  return guess;
}

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
    strengths: [],
    weaknesses: [],
    gaps: [],
    mentoringNeeds: [],
    educationSummary: "",
    questions: [],
  };
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const rawJD = form.get("jobRequirements");
    const jd = typeof rawJD === "string" ? rawJD : JSON.stringify(rawJD || "");
    const jdKeywords = await llmDeriveKeywords(jd);

    const files: File[] = [];
    for (const [key, val] of form.entries()) {
      if (key === "resumes" && val instanceof File) files.push(val);
    }
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files uploaded under key 'resumes'." },
        { status: 400 }
      );
    }

    const outCandidates: Candidate[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const id = `${i}-${f.name}`;
      let text = "";
      try {
        text = await fileToText(f);
      } catch {
        text = "";
      }

      const c = baseCandidate(id);

      const profile = text ? await llmExtractProfile(text) : {};
      c.name = profile.name || c.name;
      c.email = profile.email || c.email;
      c.phone = profile.phone || c.phone;
      c.location = profile.location || c.location;
      c.title = profile.headline || profile.title || c.title;
      c.summary = profile.summary || c.summary;

      const yearsLLM = Number(profile.yearsExperience || 0);
      c.yearsExperience = Math.max(0, Math.round(yearsLLM || 0));

      if (Array.isArray(profile.education) && profile.education.length) {
        const e0 = profile.education[0];
        const degree = [e0?.degree, e0?.field].filter(Boolean).join(", ");
        c.education = mapEduLevel(degree || "");
      }

      const skillSets = ([] as string[])
        .concat(profile.skills || [])
        .concat(profile.tools || []);
      c.skills = Array.from(
        new Set(skillSets.map((s: any) => String(s || "").trim()).filter(Boolean))
      );

      const h = scoreHeuristically(text, jdKeywords);
      c.skillsEvidencePct = Math.round(h.coverage * 100);

      const sim = domainSimilarity(jd, text);
      c.domainMismatch = sim < 0.12;

      const grade = await llmGradeCandidate(jd, text);
      c.matchScore = Math.round(
        clamp01(0.65 * h.coverage + 0.35 * clamp01((grade.score || 0) / 100)) * 100
      );
      c.strengths = Array.isArray(grade.strengths) ? grade.strengths : [];
      c.weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
      c.educationSummary = grade.educationSummary || "";
      if (Array.isArray(grade.questions)) c.questions = grade.questions;

      const missing = Array.isArray(grade.missingSkills) ? grade.missingSkills : [];
      c.gaps = missing;
      c.mentoringNeeds = (missing || []).slice(0, 3).map((g: string) => `Mentorship in ${g}`);

      outCandidates.push(c);
    }

    const payload: AnalysisResult = { jd, candidates: outCandidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze resumes." },
      { status: 500 }
    );
  }
}
