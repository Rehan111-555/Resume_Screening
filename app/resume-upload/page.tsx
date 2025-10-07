// app/resume-upload/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadBox from "@/components/UploadBox";
import { useApp } from "@/contexts/AppContext";
import type { UploadedFile, AnalysisResult } from "@/types";

function toFile(u: UploadedFile): File {
  if (u.file instanceof File) return u.file;

  let part: BlobPart;
  if (u.content instanceof Blob) part = u.content;
  else if (typeof u.content === "string") part = u.content;
  else if (u.content instanceof ArrayBuffer) part = new Uint8Array(u.content);
  else if (u.content instanceof Uint8Array) part = u.content;
  else part = "";

  const name = u.name || "upload";
  const type = u.type || "application/octet-stream";
  return new File([part], name, { type });
}

export default function ResumeUploadPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const { jobRequirements, uploadedFiles, loading } = state;

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setFiles = (files: UploadedFile[]) => {
    dispatch({ type: "SET_UPLOADED_FILES", payload: files });
  };

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
      dispatch({ type: "SET_LOADING", payload: true });

      const formData = new FormData();
      formData.append("jobRequirements", JSON.stringify(jobRequirements));
      for (const f of uploadedFiles) {
        const file = toFile(f);
        formData.append("resumes", file, file.name);
      }

      const res = await fetch("/api/analyze-resumes", { method: "POST", body: formData });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw.slice(0, 500));

      const data: AnalysisResult = JSON.parse(raw);
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
      <h1 className="text-3xl font-extrabold mb-2">Upload Resumes</h1>
      <p className="text-gray-600 mb-6">Upload PDF or DOCX (up to 100 files). We’ll analyze them against your JD.</p>

      <UploadBox uploadedFiles={uploadedFiles} onFilesUpload={setFiles} />

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={loading || !uploadedFiles.length || !jobRequirements}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-50 shadow hover:opacity-95"
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
