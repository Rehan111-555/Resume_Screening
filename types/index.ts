/** Job description coming from the form */
export interface JobRequirements {
  title: string;
  description: string;
  minYearsExperience?: number;
  educationLevel?: string;
}

/** A parsed/uploaded file before/after text extraction */
export interface UploadedFile {
  id: string;                // stable client id
  name: string;              // original filename
  size: number;              // bytes
  type: string;              // mime-type (e.g., application/pdf)
  /** client-side state for UX */
  status?: "queued" | "parsing" | "done" | "error";
  progress?: number;         // 0..100 (optional)
  /** extracted plain text (server returns it for preview/debug) */
  text?: string;
  /** error message if parsing failed */
  error?: string | null;
}

/** One candidate record used everywhere in UI */
export interface Candidate {
  id: string;

  // identity
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;        // headline / current title
  summary: string;

  // quick facts
  yearsExperience: number;         // integer years
  education: string;               // short label (e.g., "Bachelor")
  skills: string[];                // cleaned tags

  // scoring (card ribbons)
  matchScore: number;              // 0..100
  skillsEvidencePct: number;       // 0..100

  // domain flag (if false, we show "Domain not matching")
  domainMismatch?: boolean;

  // detail modal
  strengths?: string[];
  weaknesses?: string[];
  gaps?: string[];
  questions?: string[];

  // formatted markdown/plaintext for “Copy”
  formatted?: string;

  // allow extra fields without breaking
  [key: string]: unknown;
}

/** Server response shape for /api/analyze-resumes */
export interface AnalysisResult {
  jdSummary?: string;
  jdKeywords?: {
    must: { name: string; synonyms: string[] }[];
    nice: { name: string; synonyms: string[] }[];
  };
  candidates: Candidate[];
  generatedAt?: string;
}
