export interface JobRequirements {
  title: string;
  description: string;
  requiredSkills: string[];      // UI can send []
  minYearsExperience: number;    // optional at runtime
  educationLevel: string;        // optional at runtime
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
  matchScore: number;
  strengths: string[];
  weaknesses: string[];
  gaps: string[];
  mentoringNeeds: string[];
  questions: string[];
}

export interface AnalysisResult {
  candidates: Candidate[];
  questions: {
    technical: string[];
    educational: string[];
    situational: string[];
  };
  errors?: { file: string; message: string }[];
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: ArrayBuffer;
}
