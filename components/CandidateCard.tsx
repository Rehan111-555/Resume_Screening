'use client';

import type { Candidate } from '@/types';
import { GraduationCap, Briefcase } from 'lucide-react';
import { formatExperience } from '@/utils/formatExperience';

interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onClick: () => void;
}

export default function CandidateCard({ candidate, isSelected, onClick }: CandidateCardProps) {
  const scoreTone =
    candidate.matchScore >= 80 ? "bg-green-100 text-green-700" :
    candidate.matchScore >= 60 ? "bg-yellow-100 text-yellow-700" :
    "bg-rose-100 text-rose-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl border transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        isSelected ? 'border-indigo-500 bg-indigo-50 shadow' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg text-gray-900 truncate">{candidate.name}</h3>
            <p className="text-gray-600 text-sm line-clamp-1">{candidate.title}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${scoreTone}`}>
            {candidate.matchScore}% match
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
            <span className="font-semibold">{Math.round(candidate.matchScore * 0.5)}%</span>
            <span className="opacity-70">Skills & Evidence</span>
          </span>
          <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
            <Briefcase className="h-3 w-3" />
            {formatExperience(candidate.yearsExperience)}
          </span>
          <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-purple-50 text-purple-700">
            <GraduationCap className="h-3 w-3" />
            {candidate.education || '—'}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {candidate.skills.slice(0, 8).map((s, i) => (
            <span key={i} className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
              {s}
            </span>
          ))}
          {candidate.skills.length > 8 && (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500">
              +{candidate.skills.length - 8} more
            </span>
          )}
        </div>

        {candidate.questions && candidate.questions.length > 0 && (
          <p className="text-xs text-indigo-600 mt-1">
            Tailored interview questions in details
          </p>
        )}
      </div>
    </button>
  );
}
