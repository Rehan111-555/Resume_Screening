"use client";

import { AlertTriangle } from "lucide-react";
import type { Candidate } from "@/types";
import clsx from "clsx";

export default function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 hover:shadow-sm transition">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-semibold truncate">{candidate.name || "—"}</div>
          <div className="text-sm text-gray-500 truncate">
            {candidate.title || "—"}
          </div>
        </div>

        <div className="ml-3 flex flex-col items-end">
          <div
            className={clsx(
              "text-xs px-2 py-0.5 rounded-full border",
              candidate.matchScore >= 70
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : candidate.matchScore >= 40
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            )}
          >
            {candidate.matchScore}% match
          </div>

          {candidate.domainMismatch && (
            <div className="mt-1 flex items-center text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Domain not matching
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-xs text-gray-500">Skills & Evidence</div>
          <div className="font-semibold text-sm">{candidate.skillsEvidencePct || 0}%</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-xs text-gray-500">Experience</div>
          <div className="font-semibold text-sm">
            {candidate.yearsExperience > 0 ? `${candidate.yearsExperience} ${candidate.yearsExperience === 1 ? "year" : "years"}` : "0 months"}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 text-center">
          <div className="text-xs text-gray-500">Education</div>
          <div className="font-semibold text-sm truncate">
            {candidate.education || "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {(candidate.skills || []).slice(0, 8).map((s, i) => (
          <span
            key={i}
            className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 truncate"
          >
            {s}
          </span>
        ))}
        {(candidate.skills || []).length > 8 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
            +{(candidate.skills || []).length - 8} more
          </span>
        )}
      </div>

      <div className="mt-2 text-xs text-indigo-600 hover:underline cursor-pointer">
        Tailored interview questions in details
      </div>
    </div>
  );
}
