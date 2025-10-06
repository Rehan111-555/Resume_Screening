// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

export interface Candidate {
  id: string;

  // Identity & contact
  name: string;
  email: string;
  phone: string;
  location: string;

  // Role & background
  title: string;
  yearsExperience: number;
  education: string;

  // Evidence
  skills: string[];
  summary: string;

  // Scores
  matchScore: number;           // 0-100
  skillsEvidencePct: number;    // 0-100 deterministic skills/evidence percentage
  yearsScore?: number;          // optional sub-score, if you compute it
  eduScore?: number;            // optional sub-score, if you compute it

  // Narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  // Optional fields (guard in UI)
  questions?: string[];         // tailored questions (only when domain matches)
  formatted?: string;           // pre-formatted MD export (optional)

  // Domain
  domainMismatch: boolean;      // true => show “Domain not matching”, force 0 score view
}

export interface AnalysisResult {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: any;
}
