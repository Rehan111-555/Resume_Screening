// app/resume-upload/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import type { UploadedFile, AnalysisResult } from "@/types";

/**
 * Convert any of our supported buffer types into a BlobPart.
 * We intentionally cast to keep TypeScript happy across environments
 * where lib.dom types differ (ArrayBuffer vs SharedArrayBuffer).
 */
function toBlobPart(input: UploadedFile["content"]): BlobPart {
  if (typeof input === "string") return input;

  // Uint8Array is an ArrayBufferView (valid BufferSource)
  if (typeof Uint8Array !== "undefined") {
    try {
      if (input instanceof Uint8Array) return (input as unknown) as BlobPart;
    } catch {
      /* no-op */
    }
  }

  // ArrayBuffer (valid BufferSource)
  if (typeof ArrayBuffer !== "undefined") {
    try {
      if (input instanceof ArrayBuffer) return (input as unknown) as BlobPart;
    } catch {
      /* no-op */
    }
  }

  // SharedArrayBuffer (also acceptable at runtime, TS may complain; cast it)
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    input instanceof SharedArrayBuffer
  ) {
    return (input as unknown) as BlobPart;
  }

  // Fallback: if it's any typed buffer-like object, pass as-is
  if (input && typeof input === "object" && "byteLength" in (input as any)) {
    return (input as unknown) as BlobPart;
  }

  // Final fallback: stringify to bytes
  return new TextEncoder().encode(String(input));
}

export default function ResumeUploadPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const { jobRequirements, uploadedFiles, loading } = state;

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setFiles = (files: UploadedFile[]) => {
    dispatch({ type: "SET_UPLOADED_FILES", payload: files });
    try {
      sessionStorage.setItem("uploadedFiles", JSON.stringify(files));
    } catch {
      /* ignore */
    }
  };

  async function handleAnalyze() {
    setError(null);
    setSuccess(null);

    if (!jobRequirements || Object.keys(jobRequirements).length === 0) {
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
        const part = toBlobPart(f.content);
        // Cast the part to any to fully suppress overly strict lib checks
        const file = new File([part as any], f.name, {
          type: f.type || "application/octet-stream",
        });
        formData.append("resumes", file);
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
      try {
        sessionStorage.setItem("analysisResult", JSON.stringify(data));
      } catch {
        /* ignore */
      }

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
      <div className="mb-6">
        <nav className="flex gap-8 text-sm text-gray-600">
          <span>Job Requirements</span>
          <span className="font-semibold text-gray-900">Upload Resumes</span>
          <span>Results</span>
        </nav>
      </div>

      <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
        Upload Resumes
      </h1>
      <p className="text-gray-600 mb-6">
        Upload PDF or DOCX (up to 100 files). We’ll analyze them against your JD.
      </p>

      {/* Replace with your real uploader; this only shows what is already in state */}
      <div className="rounded-xl border p-4 mb-4">
        {uploadedFiles.length === 0 ? (
          <p className="text-gray-600">No files added by your uploader.</p>
        ) : (
          <ul className="list-disc ml-6 space-y-1">
            {uploadedFiles.map((f) => (
              <li key={f.id}>
                {f.name} <span className="text-gray-500">({f.type || "unknown"})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

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
