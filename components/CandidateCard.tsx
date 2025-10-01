'use client';

import type { Candidate } from '@/types';
import { GraduationCap, Briefcase } from 'lucide-react';
import { formatExperience } from '@/utils/formatExperience';

interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onClick: () => void;
}

export default function CandidateCard({
  candidate,
  isSelected,
  onClick,
}: CandidateCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left border rounded-lg p-4 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white'
      }`}
      aria-pressed={isSelected}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg text-gray-900 truncate">{candidate.name}</h3>
          <p className="text-gray-600 truncate">{candidate.title}</p>
        </div>
        <div
          className={`px-3 py-1 rounded-full font-semibold shrink-0 ${getScoreColor(
            candidate.matchScore
          )}`}
          aria-label={`Match score ${candidate.matchScore} percent`}
        >
          {candidate.matchScore}%
        </div>
      </div>

      <div className="space-y-2 mb-3 text-sm text-gray-600">
        <div className="flex items-center">
          <Briefcase className="h-4 w-4 mr-2" />
          {formatExperience(candidate.yearsExperience)} experience
        </div>
        <div className="flex items-center">
          <GraduationCap className="h-4 w-4 mr-2" />
          {candidate.education}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {candidate.skills.slice(0, 5).map((skill, index) => (
            <span
              key={`${skill}-${index}`}
              className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
            >
              {skill}
            </span>
          ))}
          {candidate.skills.length > 5 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
              +{candidate.skills.length - 5} more
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-600 line-clamp-2">{candidate.summary}</p>
    </button>
  );
}
