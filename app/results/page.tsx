"use client";

import * as React from "react";
import { useApp } from "@/contexts/AppContext";
import type { Candidate } from "@/types";
import CandidateCard from "@/components/CandidateCard";
import CandidateDetail from "@/components/CandidateDetail";

export default function ResultsPage() {
  const { state } = useApp();
  const { analysisResult } = state;

  const [selectedCandidate, setSelectedCandidate] = React.useState<Candidate | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState<boolean>(false);

  const candidates: Candidate[] = analysisResult?.candidates || [];

  function handleCandidateClick(c: Candidate) {
    setSelectedCandidate(c);
    setIsDetailOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Candidates analyzed by AI</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            onClick={() => handleCandidateClick(candidate)}
          />
        ))}
      </div>

      {/* Detail panel (inline; if you wrap this in a modal, the props are already there) */}
      {selectedCandidate && (
        <div className="mt-10 rounded-xl border p-6 bg-white">
          <CandidateDetail
            candidate={selectedCandidate}
            isOpen={isDetailOpen}
            onClose={() => setIsDetailOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
