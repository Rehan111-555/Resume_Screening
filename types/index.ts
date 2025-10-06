// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string; // "PhD" | "Master" | "Bachelor" | "Intermediate/High School"
}

export interface Candidate {
  // profile basics
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  education: string;
  yearsExperience: number; // total years (can be fractional, e.g. 2.5)
  skills: string[];
  tools: string[];
  industryDomains: string[];

  // derived UI bits
  topSkills?: string[];
  badges?: string[];

  // scoring
  matchScore: number;          // 0–100
  skillsEvidencePct: number;   // 0–100

  // domain gate
  domainMismatch: boolean;     // true => hide rich details

  // LLM outputs (hidden when domainMismatch === true)
  matchedSkills?: string[];
  missingSkills?: string[];
  strengths?: string[];
  weaknesses?: string[];
  educationSummary?: string;
  questions?: string[];

  // formatted markdown (for copy)
  formatted?: string;
}

export interface AnalyzeResponse {
  candidates: Candidate[];
}

export interface UploadItem {
  id: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}
