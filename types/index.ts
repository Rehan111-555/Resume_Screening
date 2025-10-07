// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string; // e.g., "Bachelor", "Master"
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  // Keep the native File so we can send it directly in FormData
  file?: File;
  // Optional raw content if you keep custom shape in state
  content?: string | ArrayBuffer | Uint8Array;
}

export interface Candidate {
  id: string;

  // personal / extracted
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;

  // scoring
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

  // extra fields used by UI
  questions: string[];
  educationSummary: string;
  formatted: string;
}

export interface AnalysisResult {
  candidates: Candidate[];
}
