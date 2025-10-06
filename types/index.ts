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

  // analysis
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];

  // generated Qs (empty when domainMismatch === true)
  questions: string[];

  // domain
  domainMismatch?: boolean;

  // preformatted block for clipboard
  formatted?: string;
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
