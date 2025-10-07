// app/resume-upload/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadBox from "@/components/UploadBox";
import ProgressBar from "@/components/ProgressBar";
import { useApp } from "@/contexts/AppContext";
import type { UploadedFile, AnalysisResult } from "@/types";

/** Safely turn an UploadedFile into a real File for FormData */
function toFile(u: UploadedFile): File {
  // 1) If the native File was stored, use it directly.
  if (u.file instanceof File) return u.file;

  // 2) Normalize to a BlobPart
  let part: BlobPart;

  if (typeof u.content === "string") {
    part = u.content; // text resumes
  } else if (u.content instanceof ArrayBuffer) {
    // already an ArrayBuffer
    part = u.content as ArrayBuffer;
  } else if (u.content instanceof Uint8Array) {
    // Some environments type Uint8Array as Uint8Array<ArrayBufferLike>.
    // Convert the view to a true ArrayBuffer slice the File/Blob constructor accepts.
    const start = u.content.byteOffset;
    const end = start + u.content.byteLength;
    const buf = (u.content.buffer as ArrayBuffer).slice(start, end);
    part = buf;
  } else if (u.content && typeof (u.content as any).buffer === "object") {
    // Fallback for other typed arrays (Int8Array, etc.)
    const v = u.content as unknown as { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
    const start = v.byteOffset || 0;
    const end = start + (v.byteLength || 0);
    const buf = (v.buffer as ArrayBuffer).slice(start, end);
    part = buf;
  } else {
    // 3) Ultimate fallback — empty file so the upload never crashes
    part = new ArrayBuffer(0);
  }

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
        formData.append("resumes", toFile(f));
      }

      const res = await fetch("/api/analyze-resumes", {
        method: "POST",
        body: formData,
      });

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
      <ProgressBar
        currentStep={1}
        totalSteps={3}
        labels={["Job Requirements", "Upload Resumes", "Results"]}
      />

      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
        Upload Resumes
      </h1>
      <p className="text-gray-600 mb-6">
        Upload PDF or DOCX (up to 100 files). We’ll strictly analyze them against your JD.
      </p>

      <UploadBox uploadedFiles={uploadedFiles} onFilesUpload={setFiles} />

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={loading || !uploadedFiles.length || !jobRequirements}
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
