// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

export interface UploadedFile {
  id: string;           // stable id for remove button
  file: File;           // keep the native File (no custom buffers)
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;

  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;

  // scoring
  matchScore: number;          // 0..100
  skillsEvidencePct: number;   // 0..100
  domainMismatch: boolean;     // true => show "Domain not matching"
  yearsScore?: number;         // optional weight
  eduScore?: number;           // optional weight

  // analysis strips (safe optional)
  strengths?: string[];
  weaknesses?: string[];
  gaps?: string[];
  mentoringNeeds?: string[];
  questions?: string[];
  educationSummary?: string;

  // UI helper – formatted text for Copy button (optional)
  formatted?: string;
}

export interface AnalysisResult {
  candidates: Candidate[];
}

export type SortKey = "match" | "skills" | "years";
