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

  // narratives
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions: string[];

  // new
  formatted?: string;           // exact formatted block for copy
  domainMatch?: boolean;        // false => matchScore forced to 0
  domainNote?: string;          // 'Domain not matching'
  domainFromJD?: string[];      // anchors considered
  domainFromResume?: string[];  // anchors matched
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
