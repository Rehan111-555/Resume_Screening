"use client";

import React, { useState } from "react";
import UploadBox from "@/components/UploadBox";
import type { UploadedFile } from "@/types";
import { useRouter } from "next/navigation";

export default function ResumeUploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleAnalyze() {
    if (!files.length || submitting) return;
    setSubmitting(true);
    try {
      // You likely already persist these somewhere; here’s a simple example:
      sessionStorage.setItem("uploadedFiles", JSON.stringify(files));
      router.push("/results");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-sky-700">Upload Resumes</h1>
      <p className="mt-2 text-sm text-gray-600">
        Upload PDF or DOCX (up to 100 files). We’ll analyze them against your JD.
      </p>

      <div className="mt-6">
        {/* THIS renders the visible Choose files button + drag/drop */}
        <UploadBox uploadedFiles={files} onFilesUpload={setFiles} />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={!files.length || submitting}
          className="rounded-md bg-gradient-to-r from-indigo-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Analyzing…" : "Analyze with AI"}
        </button>

        <button
          type="button"
          onClick={() => history.back()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    </div>
  );
}

