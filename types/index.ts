// types/index.ts
export type JobRequirements = {
  role?: string;
  title?: string;
  position?: string;
  description?: string;
  requiredSkills?: string[];
  niceToHave?: string[];

  // ⬇️ NEW — matches your job-requirements UI
  minYearsExperience?: number;   // e.g. 2, 4, 5
  educationLevel?: string;       // e.g. "Bachelor", "Master", "PhD"

  // keep older fields for compatibility
  education?: string;
  domain?: string;
};

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
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

  matchScore: number;
  skillsEvidencePct: number;
  yearsScore: number;
  eduScore: number;
  domainMismatch: boolean;

  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  matchedSkills?: string[];
  missingSkills?: string[];
  questions?: string[];
  educationSummary?: string;

  formatted?: string;
};

export type AnalysisResult = {
  candidates: Candidate[];
  jdText?: string;
};
