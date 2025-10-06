"use client";
import { AlertTriangle } from "lucide-react";
import type { Candidate } from "@/types";

type Props = { candidate: Candidate; isSelected?: boolean; onClick?: () => void };

export default function CandidateCard({ candidate, isSelected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={[
        "rounded-2xl border p-4 cursor-pointer transition",
        isSelected ? "border-indigo-400 ring-2 ring-indigo-200" : "border-gray-200 hover:border-gray-300",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div className="font-semibold text-gray-900 line-clamp-1">{candidate.name || candidate.title || "—"}</div>
        <div className="ml-3 text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          {candidate.matchScore}% match
        </div>
      </div>

      {candidate.domainMismatch && (
        <div className="mt-2 inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="h-3 w-3 mr-1" /> Domain not matching
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Skills & Evidence</div>
          <div className="font-semibold">{candidate.skillsEvidencePct || 0}%</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Experience</div>
          <div className="font-semibold">{candidate.yearsExperience ? `${candidate.yearsExperience} ${candidate.yearsExperience === 1 ? "year" : "years"}` : "0 months"}</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Education</div>
          <div className="font-semibold">{candidate.education || "—"}</div>
        </div>
      </div>

      {candidate.skills?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.skills.slice(0, 6).map((s, i) => (
            <span key={i} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">
              {s}
            </span>
          ))}
          {candidate.skills.length > 6 && (
            <span className="text-xs text-gray-500">+{candidate.skills.length - 6} more</span>
          )}
        </div>
      )}
    </div>
  );
}
