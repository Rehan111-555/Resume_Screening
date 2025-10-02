export interface JobRequirements {
  title: string;
  description: string;
  requiredSkills: string[];     // UI no longer asks; we send []
  minYearsExperience: number;
  educationLevel: string;
}

/* ---------- AI-generated role spec ---------- */
export type JobSpec = {
  title?: string;
  minYears?: number;
  education?: string;
  skills: { canonical: string; aliases: string[] }[];
  mustHaveSet: Set<string>;
  niceToHaveSet: Set<string>;
};

/* ---------- AI-designed JSON Schema ---------- */
export type DynamicSchema = {
  $schema?: string;
  title?: string;
  type: "object";
  properties: Record<string, any>;
  required?: string[];
};

/* ---------- Candidate ---------- */
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
  questions?: string[];
  dynamicProfile?: any;          // full object that matches the AI-designed schema
}

/* ---------- API result ---------- */
export interface AnalysisResult {
  candidates: Candidate[];
  questions: {
    technical: string[];
    educational: string[];
    situational: string[];
  };
  meta?: {
    dynamicSchema?: DynamicSchema;
    jobSpec?: any; // plain object copy (Sets removed for JSON)
  };
}

/* ---------- Upload ---------- */
export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: ArrayBuffer;
}
