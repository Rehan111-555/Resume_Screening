// app/resume-upload/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadBox from "@/components/UploadBox";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/contexts/AppContext";
import type { AnalysisResult } from "@/types";

type AnyUploaded = {
  id?: string;
  name?: string;
  type?: string;
  size?: number;
  file?: File;        // preferred (what UploadBox should provide)
  content?: unknown;  // legacy shapes – we won’t rely on this anymore
};

export default function ResumeUploadPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const { jobRequirements, uploadedFiles, loading } = state;

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setFiles = (files: AnyUploaded[]) => {
    // keep whatever UploadBox gives; store in context as-is
    dispatch({ type: "SET_UPLOADED_FILES", payload: files as any });
  };

  async function handleAnalyze() {
    setError(null);
    setSuccess(null);

    if (!jobRequirements) {
      setError("Please complete Job Requirements first.");
      return;
    }
    if (!uploadedFiles?.length) {
      setError("Please upload at least one resume.");
      return;
    }

    try {
      dispatch({ type: "SET_LOADING", payload: true });

      const formData = new FormData();
      formData.append("jobRequirements", JSON.stringify(jobRequirements));

      // ✅ Append the actual File objects only (no conversions)
      for (const u of uploadedFiles as AnyUploaded[]) {
        const f = (u as AnyUploaded)?.file;
        if (f instanceof File) {
          formData.append("resumes", f);
          continue;
        }
        // If UploadBox ever passed a raw File directly:
        if (u instanceof File) {
          formData.append("resumes", u);
          continue;
        }
        // Last-resort: skip non-File legacy entries instead of crashing build
        console.warn("Skipped non-File upload item", u);
      }

      const res = await fetch("/api/analyze-resumes", { method: "POST", body: formData });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw.slice(0, 500));

      let data: AnalysisResult;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Expected JSON but got: ${raw.slice(0, 200)}`);
      }

      dispatch({ type: "SET_ANALYSIS_RESULT", payload: data });
      setSuccess(`Analyzed ${data.candidates.length} candidates 🎉`);
      router.push("/results");
    } catch (e: any) {
      setError(e?.message || "Failed to analyze resumes.");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <ProgressBar currentStep={1} totalSteps={3} labels={["Job Requirements", "Upload Resumes", "Results"]} />

      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
        Upload Resumes
      </h1>
      <p className="text-gray-600 mb-6">
        Upload PDF or DOCX (up to 100 files). We’ll strictly analyze them against your JD.
      </p>

      <UploadBox uploadedFiles={uploadedFiles as any} onFilesUpload={setFiles} />

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={loading || !uploadedFiles?.length || !jobRequirements}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 text-white disabled:opacity-50 shadow hover:opacity-95"
        >
          {loading ? "Analyzing…" : "Analyze with AI"}
        </button>

        <button
          onClick={() => router.push("/job-requirements")}
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
