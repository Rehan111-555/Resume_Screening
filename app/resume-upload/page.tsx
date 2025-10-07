// app/resume-upload/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadBox from "@/components/UploadBox";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/contexts/AppContext";
import type { UploadedFile, AnalysisResult } from "@/types";

export default function ResumeUploadPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const { jobRequirements, uploadedFiles, loading } = state;

  const [error, setError] = useState<string | null>(null);
  const [warnedNoJD, setWarnedNoJD] = useState(false);

  const setFiles = (files: UploadedFile[]) => {
    dispatch({ type: "SET_UPLOADED_FILES", payload: files });
  };

  async function handleAnalyze() {
    setError(null);

    if (!uploadedFiles.length) {
      setError("Please upload at least one resume.");
      return;
    }

    // If the user didn’t fill the Job Requirements step, we still analyze.
    // Show a one-time warning (non-blocking) to be explicit.
    const hasJD =
      jobRequirements &&
      (jobRequirements.description ||
        jobRequirements.role ||
        jobRequirements.position ||
        jobRequirements.title ||
        (jobRequirements.requiredSkills && jobRequirements.requiredSkills.length) ||
        (jobRequirements.niceToHave && jobRequirements.niceToHave.length) ||
        jobRequirements.educationLevel ||
        typeof jobRequirements.minYearsExperience === "number");

    if (!hasJD && !warnedNoJD) {
      setWarnedNoJD(true);
      setError(
        "No Job Description/Requirements found. We’ll analyze resumes with generic scoring. (You can still proceed.)"
      );
      // fall-through and keep going
    }

    try {
      dispatch({ type: "SET_LOADING", payload: true });

      const formData = new FormData();
      formData.append("jobRequirements", JSON.stringify(jobRequirements || {}));
      for (const f of uploadedFiles) {
        // UploadBox guarantees f.file is a File object
        formData.append("resumes", f.file);
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
      router.push("/results");
    } catch (e: any) {
      setError(e?.message || "Failed to analyze resumes.");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <ProgressBar currentStep={2} totalSteps={3} labels={["Job Requirements", "Upload Resumes", "Results"]} />

      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
        Upload Resumes
      </h1>
      <p className="text-gray-600 mb-6">
        Upload PDF or DOCX (up to 100 files). We’ll analyze them against your JD (if provided).
      </p>

      <UploadBox uploadedFiles={uploadedFiles} onFilesUpload={setFiles} />

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          // ⬇️ Button only requires files; JD is optional
          disabled={loading || uploadedFiles.length === 0}
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
    </main>
  );
}
