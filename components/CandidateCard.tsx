'use client';

import type { Candidate } from '@/types';
import { GraduationCap, Briefcase, HelpCircle } from 'lucide-react';
import { formatExperience } from '@/utils/formatExperience';

interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onClick: () => void;
}

function scoreClasses(score: number) {
  if (score >= 80) return "border-green-400 from-green-50 to-white text-green-700";
  if (score >= 60) return "border-yellow-400 from-yellow-50 to-white text-yellow-700";
  return "border-red-400 from-red-50 to-white text-red-700";
}

export default function CandidateCard({ candidate, isSelected, onClick }: CandidateCardProps) {
  const q = (candidate.questions || []).slice(0, 2);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left border rounded-xl p-5 bg-gradient-to-br hover:shadow-xl transition-all duration-300
        ${scoreClasses(candidate.matchScore)} ${isSelected ? "ring-2 ring-indigo-400" : "shadow-sm"}`}
      aria-pressed={isSelected}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg text-gray-900 truncate">{candidate.name}</h3>
          <p className="text-gray-600 truncate">{candidate.title || "—"}</p>
        </div>
        <div className="px-3 py-1 rounded-full font-semibold bg-white/70 text-gray-900 shadow-sm">
          {candidate.matchScore}%
        </div>
      </div>

      <div className="space-y-2 mb-3 text-sm text-gray-700">
        <div className="flex items-center">
          <Briefcase className="h-4 w-4 mr-2" />
          {formatExperience(candidate.yearsExperience)} experience
        </div>
        <div className="flex items-center">
          <GraduationCap className="h-4 w-4 mr-2" />
          {candidate.education || "—"}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {candidate.skills.slice(0, 5).map((skill, index) => (
            <span key={`${skill}-${index}`} className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">
              {skill}
            </span>
          ))}
          {candidate.skills.length > 5 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
              +{candidate.skills.length - 5} more
            </span>
          )}
        </div>
      </div>

      {q.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center text-sm font-semibold text-indigo-700 mb-2">
            <HelpCircle className="h-4 w-4 mr-1" /> Tailored Questions
          </div>
          <ul className="space-y-1">
            {q.map((qq, i) => (
              <li key={i} className="text-xs text-gray-700 bg-indigo-50 rounded px-2 py-1">
                {qq}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-gray-600 line-clamp-2 mt-3">{candidate.summary}</p>
    </button>
  );
}
