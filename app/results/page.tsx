"use client";

import { useEffect, useState } from "react";
import type { AnalysisResult, Candidate } from "@/types";
import CandidateCard from "@/components/CandidateCard";
import CandidateDetail from "@/components/CandidateDetail";

export default function ResultsPage() {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("analysis-result");
    if (raw) {
      try { setData(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  if (!data) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold">Results</h1>
        <p className="text-gray-600 mt-2">No analysis data found.</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Candidates analyzed by AI</h1>

      <div className="grid md:grid-cols-3 gap-4">
        {data.candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onClick={() => setSelectedCandidate(c)}
          />
        ))}
      </div>

      {selectedCandidate && (
        <CandidateDetail
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </main>
  );
}
