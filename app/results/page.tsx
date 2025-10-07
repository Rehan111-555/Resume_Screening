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
  const [open, setOpen] = useState(false);

  const list = analysisResult?.candidates ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Candidates analyzed by AI</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            isSelected={selected?.id === c.id}
            onClick={() => {
              setSelected(c);
              setOpen(true);
            }}
          />
        ))}
      </div>

      <CandidateDetail
        candidate={selected}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
