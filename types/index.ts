// types/index.ts

export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;

  /** If you stored raw bytes yourself */
  content?: Blob | ArrayBuffer;

  /** If you stored the native File */
  file?: File;
}

export interface Candidate {
  id: string;

  // basics parsed from resume
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  summary: string;
  skills: string[];
  education: string;
  yearsExperience: number;

  // computed scores for list cards
  matchScore: number;
  skillsEvidencePct: number;
  yearsScore: number;
  eduScore: number;

  // domain flag used for badges/filters
  domainMismatch?: boolean;

  // preformatted, copyable detail text (optional)
  formatted?: string;

  // OPTIONAL fields the API may add for the detail modal
  questions?: string[];
  strengths?: string[];
  weaknesses?: string[];
  gaps?: string[];
  mentoringNeeds?: string[];
  matchedSkills?: string[];
  missingSkills?: string[];
  educationSummary?: string;
}

export interface AnalysisResult {
  jd: JobRequirements;
  candidates: Candidate[];
}
