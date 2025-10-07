// types/index.ts
export type UploadedFile = {
  id: string; // used by UI to remove files
  name: string;
  type: string;
  size: number;
  /** Original binary/text content captured in the browser. */
  content: ArrayBuffer | Uint8Array | string;
};

export type Candidate = {
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

  matchScore: number;          // 0..100
  skillsEvidencePct: number;   // 0..100
  domainMismatch: boolean;

  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  questions: string[];

  yearsScore: number;          // optional sub-scores used in UI
  eduScore: number;

  /** Preformatted long-form Markdown per candidate for copy/export */
  formatted: string;
};

export type AnalysisResult = {
  candidates: Candidate[];
};

export type JobRequirements = {
  role?: string;
  position?: string;
  title?: string;
  description?: string;
  requiredSkills?: string[];
  niceToHave?: string[];
  educationLevel?: string;
  minYearsExperience?: number;
};
