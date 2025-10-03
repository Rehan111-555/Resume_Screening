// types/index.ts
export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience: number;
  educationLevel: string; // e.g., "Bachelor's", "Master's", etc.
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  yearsExperience: number; // decimal years
  education: string;
  skills: string[];
  summary: string;
  matchScore: number; // 0..100
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions?: string[]; // per-candidate tailored interview questions
}

export interface AnalysisResult {
  candidates: Candidate[];
  // Optional global questions (we still show them if available)
  questions?: {
    technical: string[];
    educational: string[];
    situational: string[];
  };
  errors?: { file: string; message: string }[];
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: ArrayBuffer;
}
