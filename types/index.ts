export interface JobRequirements {
  title: string;
  description: string;
  requiredSkills: string[];
  minYearsExperience: number;
  educationLevel: string;
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
}

export interface AnalysisResult {
  candidates: Candidate[];
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