// app/results/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { AnalysisResult } from "@/types";

export default function ResultsPage() {
  const { state, dispatch } = useApp();
  const [localResult, setLocalResult] = useState<AnalysisResult | null>(
    state.analysisResult
  );

  // Hydrate from sessionStorage if context empty (hard reload safe)
  useEffect(() => {
    if (!state.analysisResult && typeof window !== "undefined") {
      const raw = sessionStorage.getItem("analysisResult");
      if (raw) {
        try {
          const parsed: AnalysisResult = JSON.parse(raw);
          dispatch({ type: "SET_ANALYSIS_RESULT", payload: parsed });
          setLocalResult(parsed);
        } catch {
          setLocalResult(null);
        }
      } else {
        setLocalResult(null);
      }
    } else {
      setLocalResult(state.analysisResult);
    }
  }, [state.analysisResult, dispatch]);

  const allText = useMemo(() => {
    const res = localResult;
    if (!res?.candidates?.length) return "";
    return res.candidates
      .map((c) => c.formatted || "")
      .filter(Boolean)
      .join("\n---\n\n");
  }, [localResult]);

  async function copyAll() {
    if (!allText) return;
    try {
      await navigator.clipboard.writeText(allText);
      alert("All candidate details copied.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = allText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      alert("All candidate details copied.");
    }
  }

  if (!localResult?.candidates?.length) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Results</h1>
        <p className="text-gray-600">No analysis data found.</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Results</h1>
        <button
          onClick={copyAll}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-90"
        >
          Copy ALL as Text
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {localResult.candidates.map((c) => (
          <div key={c.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{c.name || "—"}</h2>
                <p className="text-sm text-gray-600">{c.title || "—"}</p>
              </div>
              <span className="text-sm rounded-full px-2 py-1 bg-pink-50 text-pink-700">
                {Math.round(c.matchScore)}% match
              </span>
            </div>

            <div className="mt-3 flex gap-8 text-sm text-gray-700">
              <div>
                <div className="text-gray-500">Experience</div>
                <div>{c.yearsExperience ?? 0} years</div>
              </div>
              <div>
                <div className="text-gray-500">Skills & Evidence</div>
                <div>{Math.round(c.skillsEvidencePct)}%</div>
              </div>
              <div>
                <div className="text-gray-500">Education</div>
                <div>{c.education || "—"}</div>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={async () => {
                  const text = c.formatted || "";
                  if (!text) return;
                  try {
                    await navigator.clipboard.writeText(text);
                    alert("Candidate details copied.");
                  } catch {
                    const ta = document.createElement("textarea");
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    ta.remove();
                    alert("Candidate details copied.");
                  }
                }}
                className="px-3 py-1.5 rounded-lg border hover:bg-gray-50 text-sm"
              >
                Copy details as Text
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
