import { NextResponse } from "next/server";

type JobRequirements = {
  description?: string;
  minYearsExperience?: number;
  educationLevel?: string;
  role?: string;
  requiredSkills?: string[];
  niceToHave?: string[];
};

type Candidate = {
  id: string;
  name: string;
  title: string;
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;
  matchScore: number;
};

type AnalysisResult = { jd: JobRequirements; candidates: Candidate[] };

function stripExt(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, "");
}

function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

async function buildCandidateFromFile(file: File, jd: JobRequirements): Promise<Candidate> {
  const baseName = stripExt(file.name).replace(/[_\-]/g, " ");
  const exp = randomBetween(0, 10);
  const score = randomBetween(40, 92);

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: baseName || "Unknown",
    title: jd.role || "Shopify Developer",
    yearsExperience: exp,
    education: jd.educationLevel || "—",
    skills: (jd.requiredSkills && jd.requiredSkills.slice(0, 5)) || ["shopify", "liquid", "html", "css"],
    summary: `Auto-generated summary for ${baseName}. (Replace this with Gemini output)`,
    matchScore: score,
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const jdRaw = form.get("jobRequirements");
    let jd: JobRequirements = {};
    if (typeof jdRaw === "string" && jdRaw.trim()) {
      try {
        jd = JSON.parse(jdRaw);
      } catch {
        /* ignore parse errors */
      }
    }

    const files = form.getAll("resumes").filter((v): v is File => v instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "No resume files received." }, { status: 400 });
    }

    const candidates: Candidate[] = [];
    for (const f of files) {
      candidates.push(await buildCandidateFromFile(f, jd));
    }

    const payload: AnalysisResult = { jd, candidates };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
