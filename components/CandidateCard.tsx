"use client";

import type { Candidate } from "@/types";
import { AlertTriangle } from "lucide-react";
import clsx from "clsx";

type Props = {
  candidate: Candidate;
  isSelected?: boolean;
  onClick?: () => void;
};

export default function CandidateCard({ candidate, isSelected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left rounded-xl border p-4 transition",
        isSelected ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-200 hover:border-gray-300"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-semibold truncate">{candidate.name || "—"}</div>
          <div className="text-sm text-gray-500 truncate">{candidate.title || "—"}</div>
        </div>
        <div className="ml-3 shrink-0">
          <div className="rounded-full bg-rose-50 text-rose-700 text-xs px-2 py-0.5 border border-rose-200">
            {candidate.matchScore}% match
          </div>
          {candidate.domainMismatch && (
            <div className="mt-1 flex items-center text-rose-700 text-xs bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Domain not matching
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Skills & Evidence" value={`${candidate.skillsEvidencePct}%`} />
        <Stat label="Experience" value={`${candidate.yearsExperience || 0} ${candidate.yearsExperience === 1 ? "year" : "years"}`} />
        <Stat label="Education" value={candidate.education || "—"} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {(candidate.skills || []).slice(0, 6).map((s, i) => (
          <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full truncate">
            {s}
          </span>
        ))}
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}
