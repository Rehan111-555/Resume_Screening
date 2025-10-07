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
 *  Lightweight helpers (no external packages)
 *  ────────────────────────────────────────────────────────────── */

/** minimal html→text (enough for resumes pasted as HTML) */
function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<\/(h[1-6]|li|tr)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // decode a few common entities
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  return s.replace(/\s+/g, " ").trim();
}

/** robust-ish byte → utf8 text (filters binary) */
function bytesToText(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dec = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  let txt = dec.decode(u8);
  // strip obvious binary noise
  txt = txt.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ");
  return txt.replace(/\s+/g, " ").trim();
}

/** Try to read PDF text.
 *  - If `pdf-parse` is available in your project, we use it.
 *  - Otherwise we fall back to a best-effort decode (works on some text PDFs).
 */
async function extractTextFromPdf(u8: Uint8Array): Promise<string> {
  try {
    // Optional dependency. If you installed "pdf-parse", this path will work.
    const mod = await import("pdf-parse").catch(() => null as any);
    if (mod) {
      const pdfParse = (mod.default ?? mod) as (d: Buffer | Uint8Array) => Promise<{ text: string }>;
      const res = await pdfParse(u8);
      return (res?.text || "").trim();
    }
  } catch {
    /* fall through */
  }
  // Fallback: decode the bytes (works only for simple, text-based PDFs)
  return bytesToText(u8);
}

/** Very small DOCX text extractor (unzips XML only if global crypto.subtle exists).
 *  If unzip is unavailable, we fall back to best-effort bytes → text.
 */
async function extractTextFromDocx(u8: Uint8Array): Promise<string> {
  // avoid new deps; try Web Streams unzip if available (Edge runtimes)
  try {
    // Lazy import tiny unzipper that uses Web APIs (no node deps)
    const { unzip } = await import("@zip.js/zip.js").catch(() => ({ unzip: null as any }));
    if (unzip) {
      const reader = new (global as any).Blob([u8]).stream();
      const entries = await unzip(reader);
      let xml = "";
      for await (const entry of entries) {
        if (entry?.filename?.endsWith("word/document.xml")) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of entry.stream()) chunks.push(chunk);
          const full = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
          let off = 0;
          for (const c of chunks) {
            full.set(c, off);
            off += c.length;
          }
          xml = new TextDecoder().decode(full);
          break;
        }
      }
      if (xml) {
        const text = xml
          .replace(/<w:p[^>]*>/g, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return text;
      }
    }
  } catch {
    /* ignore and fallback */
  }
  return bytesToText(u8);
}

/** Detect extension quickly */
function extOf(name = ""): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Convert uploaded File -> plain text (no extra deps required) */
async function fileToText(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  const mime = (f.type || "").toLowerCase();
  const ext = extOf(f.name);

  if (mime.includes("pdf") || ext === "pdf") {
    return await extractTextFromPdf(buf);
  }
  if (ext === "docx" || mime.includes("officedocument")) {
    return await extractTextFromDocx(buf);
  }
  if (mime.includes("html") || ext === "html" || /<\/?[a-z][\s\S]*>/i.test(bytesToText(buf))) {
    return htmlToText(bytesToText(buf));
  }
  return bytesToText(buf);
}

/** Build the Candidate skeleton with defaults */
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
    // the UI won’t crash if these are absent, but many designs expect them
    questions: [],
  };
}

/** ──────────────────────────────────────────────────────────────
 *  API Route
 *  ────────────────────────────────────────────────────────────── */
export const runtime = "nodejs"; // ensure we run on the server

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const rawJD = form.get("jobRequirements");
    const jd = typeof rawJD === "string" ? rawJD : JSON.stringify(rawJD || "");
    const jdKeywords = await llmDeriveKeywords(jd);

    // Collect files
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

    // Process each resume
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const id = `${i}-${f.name}`;
      let text = "";
      try {
        text = await fileToText(f);
      } catch (e) {
        text = "";
      }

      const c = baseCandidate(id);

      // 1) LLM profile extraction
      const profile = text ? await llmExtractProfile(text) : {};
      c.name = profile.name || c.name;
      c.email = profile.email || c.email;
      c.phone = profile.phone || c.phone;
      c.location = profile.location || c.location;
      c.title = profile.headline || profile.title || c.title;
      c.summary = profile.summary || c.summary;

      const yearsLLM = Number(profile.yearsExperience || 0);
      const yearsHeur = yearsLLM || 0; // (your estimateYears is inside gemini util if you kept it)
      c.yearsExperience = Math.max(0, Math.round(yearsHeur));

      // Education (first degree)
      if (Array.isArray(profile.education) && profile.education.length) {
        const e0 = profile.education[0];
        const degree = [e0?.degree, e0?.field].filter(Boolean).join(", ");
        c.education = mapEduLevel(degree || "");
      }

      // Skills
      const skillSets = ([] as string[])
        .concat(profile.skills || [])
        .concat(profile.tools || []);
      c.skills = Array.from(new Set(skillSets.map((s: any) => String(s || "").trim()).filter(Boolean)));

      // 2) Quick heuristic score (JD coverage)
      const h = scoreHeuristically(text, jdKeywords);
      c.skillsEvidencePct = Math.round(h.coverage * 100);

      // 3) Domain similarity → mismatch flag
      const sim = domainSimilarity(jd, text);
      c.domainMismatch = sim < 0.12; // tuneable threshold

      // 4) LLM grading
      const grade = await llmGradeCandidate(jd, text);
      c.matchScore = Math.round(
        clamp01(0.65 * h.coverage + 0.35 * clamp01((grade.score || 0) / 100)) * 100
      );
      c.strengths = Array.isArray(grade.strengths) ? grade.strengths : [];
      c.weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
      c.educationSummary = grade.educationSummary || "";
      if (Array.isArray(grade.questions)) c.questions = grade.questions;

      // Gaps / mentoring
      const missing = Array.isArray(grade.missingSkills) ? grade.missingSkills : [];
      c.gaps = missing;
      c.mentoringNeeds = (missing || []).slice(0, 3).map((g: string) => `Mentorship in ${g}`);

      outCandidates.push(c);
    }

    const payload: AnalysisResult = {
      jd,
      candidates: outCandidates,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze resumes." },
      { status: 500 }
    );
  }
}
