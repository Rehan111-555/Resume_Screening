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
  matchScore: number;        // 0-100
  skillsEvidencePct: number; // 0-100

  // Narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  // Optional AI extras
  questions?: string[];
  formatted?: string;

  // Domain
  domainMismatch: boolean;

  // Optional rubric extras
  matchedSkills?: string[];
  missingSkills?: string[];
  educationSummary?: string;
}

export interface AnalysisResult {
  candidates: Candidate[];
  errors?: { file: string; message: string }[];
  meta?: any;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: ArrayBuffer;
}
