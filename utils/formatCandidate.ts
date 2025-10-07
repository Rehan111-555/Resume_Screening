// utils/formatCandidate.ts
import type { Candidate } from "@/types";

function pct(n: number | undefined | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function formatCandidateMarkdown(c: Candidate): string {
  const name = c.name || "—";
  const email = c.email || "—";
  const phone = c.phone || "—";
  const location = c.location || "—";
  const years =
    typeof c.yearsExperience === "number" && c.yearsExperience > 0
      ? `${c.yearsExperience} years`
      : "—";
  const edu = c.education || "—";
  const overall = pct(c.matchScore);
  const skillsPct = pct(c.skillsEvidencePct);
  const skills = c.skills?.length ? c.skills.join(", ") : "—";
  const questions = c.questions?.length
    ? c.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "—";
  const strengths = c.strengths?.length
    ? c.strengths.map((s) => `* ${s}`).join("\n")
    : "* —";
  const weaknesses = c.weaknesses?.length
    ? c.weaknesses.map((s) => `* ${s}`).join("\n")
    : "* —";
  const gaps = c.gaps?.length ? c.gaps.map((g) => `* ${g}`).join("\n") : "* —";
  const mentoring =
    c.mentoringNeeds?.length
      ? c.mentoringNeeds.map((g) => `* ${g}`).join("\n")
      : "* —";
  const summary = c.summary || "—";

  return `## Candidate Details — **${name}**

**Personal Information**

* Email: ${email}
* Phone: ${phone}
* Location: ${location}

**Professional Summary**
${summary}

**Match Breakdown**

* **Overall Match:** ${overall}
* **Experience:** ${years}
* **Skills & Evidence:** ${skillsPct}
* **Education:** ${edu}

**Skills**
${skills}

**AI Interview Questions**
${questions}

**Strengths**
${strengths}

**Areas for Improvement**
${weaknesses}

**Identified Gaps (vs JD)**
${gaps}

**Mentoring Needs**
${mentoring}
`;
}
