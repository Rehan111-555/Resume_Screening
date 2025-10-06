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

  /**
   * The raw content if you stored bytes yourself.
   * Your UploadBox may put a Blob OR ArrayBuffer here.
   * It’s optional because some implementations keep the native File instead.
   */
  content?: Blob | ArrayBuffer;

  /**
   * Optional native File. If your UploadBox keeps the File,
   * we’ll use it directly when posting to the API.
   */
  file?: File;
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
  yearsScore: number;
  eduScore: number;

  // domain flags
  domainMismatch?: boolean;

  // UI
  formatted?: string;
}

export interface AnalysisResult {
  jd: JobRequirements;
  candidates: Candidate[];
}
