// components/CandidateCard.tsx
"use client";
import type { Candidate } from "@/types";

export default function CandidateCard({
  candidate,
  onClick,
  isSelected,
}: {
  candidate: Candidate;
  onClick: () => void;
  isSelected?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 hover:shadow ${
        isSelected ? "ring-2 ring-indigo-500" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="font-semibold truncate">{candidate.name || "—"}</div>
        <div className="text-sm px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          {candidate.matchScore}% match
        </div>
      </div>

      <div className="mt-2 text-sm text-gray-600 truncate">
        {candidate.title || "—"}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Skills & Evidence</div>
          <div className="font-semibold">{candidate.skillsEvidencePct}%</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Experience</div>
          <div className="font-semibold">{candidate.yearsExperience || 0} years</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Education</div>
          <div className="font-semibold">{candidate.education || "—"}</div>
        </div>
      </div>

      {candidate.domainMismatch === true && (
        <div className="mt-3 inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          Domain not matching
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(candidate.skills || []).slice(0, 5).map((s, i) => (
          <span key={i} className="text-xs rounded bg-gray-100 px-2 py-1">
            {s}
          </span>
        ))}
      </div>
    </button>
  );
}
