// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

export interface Candidate {
  id: string;

  // basics parsed from resume
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;              // headline / current title
  yearsExperience: number;    // total years (robustly parsed)
  education: string;          // single-line summary (e.g., "Bachelor CS")
  skills: string[];           // cleaned skill chips
  summary: string;            // brief professional summary

  // scores used by cards
  matchScore: number;         // 0–100
  skillsEvidencePct: number;  // 0–100 (coverage)
  domainMismatch: boolean;    // true if outside JD domain

  // extra scoring components (OPTIONAL so UI can ignore safely)
  yearsScore?: number;        // 0..1
  eduScore?: number;          // 0..1

  // optional, some UIs might read these; keep them here to avoid TS errors
  questions?: string[];
  strengths?: string[];
  weaknesses?: string[];
  gaps?: string[];
  mentoringNeeds?: string[];
  formatted?: string;         // preformatted clipboard text
}

export interface AnalysisResult {
  candidates: Candidate[];
}

/**
 * Uploaded file structure used in client pages/components.
 * Keep both `file` and `content` optional to be compatible with prior code.
 */
export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  file?: File;                          // when you store the native File object
  content?: ArrayBuffer | Uint8Array | string; // when you cached raw content
}
