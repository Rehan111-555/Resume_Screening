// app/results/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { Candidate } from "@/types";
import CandidateCard from "@/components/CandidateCard";
import CandidateDetail from "@/components/CandidateDetail";

export default function ResultsPage() {
  const { state } = useApp();
  const { analysisResult } = state;

  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const candidates = useMemo<Candidate[]>(() => {
    return analysisResult?.candidates ?? [];
  }, [analysisResult]);

  function openDetail(c: Candidate) {
    setSelectedCandidate(c);
  }

  function closeDetail() {
    setSelectedCandidate(null);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Results</h1>
        <p className="text-gray-600">
          {candidates.length
            ? `Analyzed ${candidates.length} candidate${candidates.length > 1 ? "s" : ""}.`
            : "No candidates yet. Go back and upload resumes."}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((c) => (
          <div
            key={c.id}
            className="cursor-pointer"
            onClick={() => openDetail(c)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openDetail(c);
            }}
          >
            <CandidateCard candidate={c} />
          </div>
        ))}
      </div>

      {selectedCandidate && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={closeDetail}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CandidateDetail candidate={selectedCandidate} onClose={closeDetail} />
          </div>
        </div>
      )}
    </main>
  );
}
