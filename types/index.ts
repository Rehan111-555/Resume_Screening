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

  // scoring + flags
  matchScore: number;
  skillsEvidencePct: number;
  domainMismatch?: boolean;

  // details (empty when domainMismatch)
  questions: string[];
  strengths: string[];
  weaknesses: string[];
  gaps: string[];

  // optional render helpers
  formatted?: string;
}
