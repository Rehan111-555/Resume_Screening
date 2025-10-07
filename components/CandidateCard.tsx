// components/CandidateCard.tsx
"use client";

import type { Candidate } from "@/types";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  candidate: Candidate;
  isSelected?: boolean;
  onClick?: () => void;
};

export default function CandidateCard({ candidate, isSelected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 cursor-pointer transition",
        isSelected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-gray-200 hover:border-gray-300"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="font-medium truncate">{candidate.name || "—"}</div>
        <div className="text-rose-500 text-xs font-medium">{candidate.matchScore}% match</div>
      </div>

      {candidate.domainMismatch === true && (
        <div className="mt-2 inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          Domain not matching
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label="Skills & Evidence" value={`${candidate.skillsEvidencePct}%`} />
        <Badge label="Experience" value={`${candidate.yearsExperience} years`} />
        <Badge label="Education" value={candidate.education || "—"} />
      </div>

      {!!candidate.skills?.length && (
        <div className="mt-3 flex flex-wrap gap-1">
          {candidate.skills.slice(0, 6).map((s, i) => (
            <span key={`${s}-${i}`} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
      <span className="text-gray-500">{label}</span> <span className="font-medium">{value}</span>
    </div>
  );
}
