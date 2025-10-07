"use client";

import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate;
  onClick?: () => void;
};

export default function CandidateCard({ candidate, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="rounded-2xl border p-4 hover:shadow cursor-pointer transition"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold truncate">{candidate.name || "—"}</h3>
        <span className="text-xs rounded-full bg-rose-50 text-rose-600 px-2 py-0.5">
          {candidate.matchScore}% match
        </span>
      </div>

      <p className="mt-1 text-sm text-gray-600 truncate">
        {candidate.title || "—"}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-gray-400">Skills & Evidence</div>
          <div className="font-semibold">{candidate.skillsEvidencePct}%</div>
        </div>
        <div>
          <div className="text-gray-400">Experience</div>
          <div className="font-semibold">{candidate.yearsExperience} years</div>
        </div>
        <div>
          <div className="text-gray-400">Education</div>
          <div className="font-semibold">{candidate.education || "—"}</div>
        </div>
      </div>

      {candidate.domainMismatch && (
        <div className="mt-3 inline-block text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
          Domain not matching
        </div>
      )}
    </div>
  );
}
