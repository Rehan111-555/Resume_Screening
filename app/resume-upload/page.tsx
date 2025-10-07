"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadBox from "@/components/UploadBox";
import ProgressBar from "@/components/ProgressBar";
import type { UploadedFile, AnalysisResult } from "@/types";

export default function ResumeUploadPage() {
  const router = useRouter();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [jobRequirements, setJobRequirements] = useState<any>(null); // plug your context here if you have it
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // If you already have a context (AppContext), replace state above with your context fields.

  async function handleAnalyze() {
    setError(null);
    setSuccess(null);

    if (!jobRequirements) {
      setError("Please complete Job Requirements first.");
      return;
    }
    if (!uploadedFiles.length) {
      setError("Please upload at least one resume.");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("jobRequirements", JSON.stringify(jobRequirements));
      for (const f of uploadedFiles) {
        formData.append("resumes", f.file, f.name);
      }

      const res = await fetch("/api/analyze-resumes", { method: "POST", body: formData });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw.slice(0, 500));

      let data: AnalysisResult;
      try { data = JSON.parse(raw); } catch { throw new Error(`Expected JSON but got: ${raw.slice(0, 200)}`); }

      // store to session/local and go to results (or use your context)
      sessionStorage.setItem("analysis-result", JSON.stringify(data));
      setSuccess(`Analyzed ${data.candidates.length} candidates 🎉`);
      router.push("/results");
    } catch (e: any) {
      setError(e?.message || "Failed to analyze resumes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <ProgressBar currentStep={1} totalSteps={3} labels={["Job Requirements", "Upload Resumes", "Results"]} />

      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
        Upload Resumes
      </h1>
      <p className="text-gray-600 mb-6">Upload PDF or DOCX (up to 100 files). We’ll analyze them against your JD.</p>

      <UploadBox uploadedFiles={uploadedFiles} onFilesUpload={setUploadedFiles} />

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={loading || !uploadedFiles.length || !jobRequirements}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 text-white disabled:opacity-50 shadow hover:opacity-95"
        >
          {loading ? "Analyzing…" : "Analyze with AI"}
        </button>

        <button
          onClick={() => history.back()}
          className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
      </div>

      {error && <div className="mt-4 text-red-600">{error}</div>}
      {success && <div className="mt-4 text-green-700">{success}</div>}
    </main>
  );
}
