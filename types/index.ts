export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
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
  matchScore: number;
  skillsEvidencePct: number;

  // narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions: string[];

  // new
  domainMismatch?: boolean;     // true => force 0% + hide extras
  formatted?: string;           // pre-rendered MD block you want to copy/share
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
