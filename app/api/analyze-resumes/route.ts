// app/api/analyze-resumes/route.ts
import { NextResponse } from "next/server";
import type { AnalysisResult, Candidate, JobRequirements } from "@/types";
import { formatCandidateMarkdown } from "@/utils/formatCandidate";

export const dynamic = "force-dynamic"; // avoid static caching

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // Job Requirements (optional)
    const jdRaw = form.get("jobRequirements");
    const jd: Partial<JobRequirements> =
      typeof jdRaw === "string" ? JSON.parse(jdRaw) : {};

    // Files (PDF/DOCX)
    const files = form.getAll("resumes").filter((x) => x instanceof File) as File[];
    if (!files.length) {
      return NextResponse.json(
        { error: "No resumes uploaded." },
        { status: 400 }
      );
    }

    // TODO: Replace this "stub generation" with your real parsing + scoring.
    // For now we generate a properly shaped candidate for each file so the UI works entirely.
    const candidates: Candidate[] = [];

    for (const f of files) {
      const nameGuess = f.name.replace(/\.(pdf|docx?)$/i, "").replace(/[_\-]+/g, " ");
      const c: Candidate = {
        id: crypto.randomUUID(),
        name: nameGuess,
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
        questions: [],
        yearsScore: 0,
        eduScore: 0,
        formatted: "",
      };

      // IMPORTANT: After you compute real fields, regenerate formatted text:
      c.formatted = formatCandidateMarkdown(c);

      candidates.push(c);
    }

    const payload: AnalysisResult = { candidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed to analyze" },
      { status: 500 }
    );
  }
}
