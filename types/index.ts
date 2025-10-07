// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string; // "Bachelor" | "Master" | "PhD" | etc.
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  file?: File; // Prefer real File for FormData
  content?: string | ArrayBuffer | Uint8Array; // optional legacy
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

  matchScore: number;        // 0..100
  skillsEvidencePct: number; // 0..100
  domainMismatch: boolean;

  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  questions: string[];
  educationSummary: string;
  formatted: string;
}

export interface AnalysisResult {
  candidates: Candidate[];
}
