// components/CandidateCard.tsx
"use client";

import type { Candidate } from "@/types";
import { GraduationCap, Briefcase, MessageSquare } from "lucide-react";
import { formatExperience } from "@/utils/formatExperience";

interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onClick: () => void;
}

export default function CandidateCard({ candidate, isSelected, onClick }: CandidateCardProps) {
  const badge = scoreBadge(candidate.matchScore);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left border rounded-2xl p-4 transition-all hover:shadow-md ${
        isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"
      }`}
      aria-pressed={isSelected}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg text-gray-900 truncate">{candidate.name}</h3>
          <p className="text-gray-600 truncate">{candidate.title}</p>
        </div>
        <div className={`px-3 py-1 rounded-full font-semibold shrink-0 ${badge.bg} ${badge.text}`}>
          {candidate.matchScore}% match
        </div>
      </div>

      <div className="space-y-2 mb-3 text-sm text-gray-600">
        <div className="flex items-center">
          <Briefcase className="h-4 w-4 mr-2 text-indigo-500" />
          {formatExperience(candidate.yearsExperience)} experience
        </div>
        <div className="flex items-center">
          <GraduationCap className="h-4 w-4 mr-2 text-rose-500" />
          {candidate.education || "—"}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {candidate.skills.slice(0, 6).map((skill, index) => (
            <span
              key={`${skill}-${index}`}
              className="px-2 py-1 bg-gradient-to-r from-indigo-50 to-white border text-indigo-700 text-xs rounded"
            >
              {skill}
            </span>
          ))}
          {candidate.skills.length > 6 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">+{candidate.skills.length - 6} more</span>
          )}
        </div>
      </div>

      {candidate.questions && candidate.questions.length > 0 && (
        <div className="flex items-center text-xs text-gray-500">
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          Tailored interview questions available
        </div>
      )}
    </button>
  );
}

function scoreBadge(score: number) {
  if (score >= 80) return { bg: "bg-green-50", text: "text-green-700" };
  if (score >= 60) return { bg: "bg-yellow-50", text: "text-yellow-700" };
  return { bg: "bg-red-50", text: "text-red-700" };
}
