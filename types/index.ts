export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

export interface Candidate {
  // identity
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;

  // resume-derived
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;

  // scores
  matchScore: number;          // 0–100
  skillsEvidencePct: number;   // 0–100
  domainMismatch: boolean;

  // detail sections (always arrays, never undefined)
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  // Q&A (empty when domainMismatch = true)
  questions: string[];

  // extra display info (safe strings)
  educationSummary: string;
  formatted?: string;
}

export interface AnalysisResult {
  candidates: Candidate[];
}

export type UploadedFile = {
  name: string;
  type: string;
  size: number;
  // content as one of the typical web upload shapes — we'll normalize in the page
  content?: string | ArrayBuffer | Uint8Array<ArrayBufferLike>;
  file?: File; // when available (browser)
};
