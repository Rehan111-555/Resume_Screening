// app/results/page.tsx
"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import CandidateCard from "@/components/CandidateCard";
import CandidateDetail from "@/components/CandidateDetail";
import type { Candidate } from "@/types";

export default function ResultsPage() {
  const { state } = useApp();
  const { analysisResult } = state;
  const [selected, setSelected] = useState<Candidate | null>(null);

  const candidates = analysisResult?.candidates || [];

  return (
    <main className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Candidates analyzed by AI</h1>

      {candidates.length === 0 ? (
        <div className="text-gray-600">No candidates yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              isSelected={selected?.id === c.id}
              onClick={() => setSelected(c)}
            />
          ))}
        </div>
      )}

      {selected && <CandidateDetail candidate={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
