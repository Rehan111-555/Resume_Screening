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
  matchScore: number;        // 0..100
  skillsEvidencePct: number; // 0..100

  // narrative
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  // interview
  questions: string[];

  // UX / safeguards
  formatted?: string;            // pre-formatted clipboard text
  domainMismatch?: boolean;      // true = different domain than JD
  domainHints?: string[];        // short signature terms used for detection
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
