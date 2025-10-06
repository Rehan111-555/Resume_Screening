// types/index.ts

/** Job definition provided by the user */
export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

/** Canonical Candidate shape used across API + UI */
export interface Candidate {
  id: string;

  // Identity & contact
  name: string;
  email: string;
  phone: string;
  location: string;

  // Role & background
  title: string;
  yearsExperience: number;      // numeric years (can be fractional)
  education: string;            // normalized label or raw string

  // Evidence
  skills: string[];             // tags
  summary: string;              // brief professional summary

  // Scores (primary)
  matchScore: number;           // 0-100 (overall)
  skillsEvidencePct: number;    // 0-100 (deterministic coverage %)

  // Scores (optional sub-scores if you compute them)
  yearsScore?: number;          // optional
  eduScore?: number;            // optional

  // Narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  // Optional AI extras (guard in UI)
  questions?: string[];         // tailored questions (omit when domainMismatch = true)
  formatted?: string;           // preformatted “export” text (optional)

  // Domain control
  domainMismatch: boolean;      // true => treat as out-of-domain (force 0, hide extras)

  // Optional fields from LLM rubric
  matchedSkills?: string[];
  missingSkills?: string[];
  educationSummary?: string;
}

/** API result payload */
export interface AnalysisResult {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: any;
  jd?: any; // <-- allows your route to include { jd, candidates: ... }
}
