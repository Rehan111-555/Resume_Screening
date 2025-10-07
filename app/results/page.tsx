"use client";

import React, { useEffect, useMemo, useState } from "react";
import CandidateCard from "@/components/CandidateCard";
import type { UploadedFile } from "@/types";

type JobRequirements = {
  description?: string;
  minYearsExperience?: number;
  educationLevel?: string;
  role?: string;
  requiredSkills?: string[];
  niceToHave?: string[];
};

type Candidate = {
  id: string;
  name: string;
  title: string;
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;
  matchScore: number;
};

type AnalysisResult = {
  jd: JobRequirements;
  candidates: Candidate[];
};

function toBlobFromArrayBuffer(buf: ArrayBuffer, type = "application/octet-stream") {
  return new Blob([new Uint8Array(buf)], { type });
}

export default function ResultsPage() {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // restore persisted analysis if any
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("analysis");
      if (cached) {
        const parsed = JSON.parse(cached) as AnalysisResult;
        setData(parsed);
        return;
      }
    } catch {}
  }, []);

  // if no analysis, but have files in sessionStorage, call API
  useEffect(() => {
    (async () => {
      if (data) return; // already have it
      try {
        const rawFiles = sessionStorage.getItem("uploadedFiles");
        if (!rawFiles) return;
        const files: UploadedFile[] = JSON.parse(rawFiles);

        const rawJD = sessionStorage.getItem("jobRequirements");
        const jd: JobRequirements = rawJD ? JSON.parse(rawJD) : {};

        if (!files.length) return;

        setLoading(true);
        setErr(null);

        const form = new FormData();
        form.append("jobRequirements", JSON.stringify(jd));
        for (const f of files) {
          const blob = toBlobFromArrayBuffer(f.content, f.type || "application/octet-stream");
          form.append("resumes", new File([blob], f.name, { type: f.type || "application/octet-stream" }));
        }

        const res = await fetch("/api/analyze-resumes", { method: "POST", body: form });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `Analyze failed (${res.status})`);
        }
        const payload: AnalysisResult = await res.json();
        setData(payload);
        sessionStorage.setItem("analysis", JSON.stringify(payload));
      } catch (e: any) {
        setErr(e?.message || "Failed to analyze resumes.");
      } finally {
        setLoading(false);
      }
    })();
  }, [data]);

  if (err) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="mt-4 text-red-600">{err}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="mt-4 text-gray-600">Analyzing resumes…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="mt-4 text-gray-600">No analysis data found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold">Results</h1>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">Job Summary</h2>
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
          {[
            data.jd.role || "",
            data.jd.description || "",
            (data.jd.requiredSkills || []).join(", "),
          ]
            .filter(Boolean)
            .join(" • ")}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} />
        ))}
      </div>
    </div>
  );
}
