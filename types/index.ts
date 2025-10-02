export interface JobRequirements {
  title: string;
  description: string;
  requiredSkills: string[];     // kept for compatibility (we send []), not shown in UI
  minYearsExperience: number;
  educationLevel: string;
}

export type JobSpec = {
  title?: string;
  minYears?: number;
  education?: string;
  skills: { canonical: string; aliases: string[] }[];
  mustHaveSet: Set<string>;
  niceToHaveSet: Set<string>;
};

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
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions?: string[];         // NEW: per-candidate questions
}

export interface AnalysisResult {
  candidates: Candidate[];
  // kept for backward compatibility (unused in UI now)
  questions: {
    technical: string[];
    educational: string[];
    situational: string[];
  };
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: ArrayBuffer;
}
