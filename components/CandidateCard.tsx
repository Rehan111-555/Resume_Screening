// components/CandidateCard.tsx
"use client";

import type { Candidate } from "@/types";
import { AlertTriangle, Briefcase, GraduationCap } from "lucide-react";

type Props = { candidate: Candidate };

export default function CandidateCard({ candidate }: Props) {
  const score = Math.max(0, Math.min(100, Number(candidate.matchScore || 0)));

  const scoreColor =
    score >= 85
      ? "text-green-700 bg-green-50 ring-1 ring-green-200"
      : score >= 65
      ? "text-yellow-700 bg-yellow-50 ring-1 ring-yellow-200"
      : "text-red-700 bg-red-50 ring-1 ring-red-200";

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-gray-900" title={candidate.name}>
            {candidate.name}
          </h3>
          <p className="line-clamp-2 text-sm text-gray-600" title={candidate.title}>
            {candidate.title || "—"}
          </p>
        </div>
        <div
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${scoreColor}`}
          title={`Match score ${score}%`}
        >
          {candidate.domainMismatch ? "0% match" : `${score}% match`}
        </div>
      </div>

      {/* Badges */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-blue-50 p-2 text-center text-blue-700">
          <div className="font-bold">{candidate.domainMismatch ? 0 : candidate.skillsEvidencePct}%</div>
          <div className="mt-0.5 text-[11px]">Skills & Evidence</div>
        </div>
        <div className="flex items-center justify-center rounded-md bg-emerald-50 p-2 text-emerald-700">
          <Briefcase className="mr-1.5 h-4 w-4" />
          {Number.isFinite(candidate.yearsExperience)
            ? `${Math.max(0, candidate.yearsExperience).toFixed(1)}y`
            : "—"}
        </div>
        <div className="flex items-center justify-center rounded-md bg-purple-50 p-2 text-purple-700">
          <GraduationCap className="mr-1.5 h-4 w-4" />
          <span className="truncate" title={candidate.education}>
            {candidate.education || "—"}
          </span>
        </div>
      </div>

      {/* Skills chips */}
      <div className="mb-3">
        <div className="flex max-h-16 flex-wrap gap-1 overflow-hidden">
          {(candidate.skills || []).slice(0, 8).map((s, idx) => (
            <span
              key={`${s}-${idx}`}
              className="truncate rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800"
              title={s}
            >
              {s}
            </span>
          ))}
          {candidate.skills && candidate.skills.length > 8 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              +{candidate.skills.length - 8} more
            </span>
          )}
        </div>
      </div>

      {/* Domain flag */}
      {candidate.domainMismatch && (
        <div className="flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[12px] text-rose-700">
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          Domain not matching
        </div>
      )}
    </div>
  );
}
