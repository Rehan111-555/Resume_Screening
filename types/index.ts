export type JobRequirements = {
  role?: string;
  title?: string;
  position?: string;
  description?: string;
  requiredSkills?: string[];
  niceToHave?: string[];
  education?: string;
  domain?: string;
};

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File; // keep native file to send as-is
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
  jdText?: string; // helpful for debugging; optional so type never breaks
};
