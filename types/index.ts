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
  matchScore: number;        // 0–100
  skillsEvidencePct: number; // 0–100

  // narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions: string[];

  // UX helpers
  formatted?: string;          // preformatted Markdown text for "Copy"
  domainMismatch?: boolean;    // if true → force matchScore=0 and hide narratives
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
