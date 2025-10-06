'use client';

import type { Candidate } from '@/types';
import { GraduationCap, Briefcase, HelpCircle, AlertTriangle } from 'lucide-react';
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
    if (score >= 85) return 'text-green-700 bg-green-50 ring-1 ring-green-200';
    if (score >= 65) return 'text-yellow-700 bg-yellow-50 ring-1 ring-yellow-200';
    return 'text-red-700 bg-red-50 ring-1 ring-red-200';
  };

  // defensively clamp a noisy skills array to strings only
  const skills = (candidate.skills || []).map(String).filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left border rounded-2xl p-4 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        isSelected ? 'border-indigo-500 bg-indigo-50/40 shadow-md' : 'border-gray-200 bg-white'
      }`}
      aria-pressed={isSelected}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3 gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg text-gray-900 truncate" title={candidate.name}>
            {candidate.name}
          </h3>
          <p className="text-gray-600 truncate" title={candidate.title}>
            {candidate.title}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div
            className={`px-3 py-1 rounded-full font-semibold ${getScoreColor(
              candidate.matchScore
            )}`}
            aria-label={`Match score ${candidate.matchScore} percent`}
          >
            {candidate.matchScore}% match
          </div>

          {/* Domain mismatch badge (new) */}
          {candidate.domainMismatch === true && (
            <div
              className="flex items-center text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200"
              title="The resume domain doesn't match the job domain"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Domain not matching
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        <div className="text-center p-2 rounded-lg bg-blue-50 text-blue-700">
          <div className="font-bold">{Math.max(0, Math.min(100, candidate.skillsEvidencePct))}%</div>
          <div className="text-xs">Skills & Evidence</div>
        </div>
        <div className="flex items-center justify-center p-2 rounded-lg bg-emerald-50 text-emerald-700">
          <Briefcase className="h-4 w-4 mr-2" />
          {formatExperience(candidate.yearsExperience)}
        </div>
        <div className="flex items-center justify-center p-2 rounded-lg bg-purple-50 text-purple-700">
          <GraduationCap className="h-4 w-4 mr-2" />
          {candidate.education || '—'}
        </div>
      </div>

      {/* Skills */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {skills.slice(0, 6).map((skill, index) => (
            <span
              key={`${skill}-${index}`}
              className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full max-w-[10rem] truncate"
              title={skill}
            >
              {skill}
            </span>
          ))}
          {skills.length > 6 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
              +{skills.length - 6} more
            </span>
          )}
        </div>
      </div>

      {/* Footer hint — hidden if domain mismatched */}
      {!candidate.domainMismatch && (
        <div className="flex items-center text-indigo-600 text-sm">
          <HelpCircle className="h-4 w-4 mr-1" />
          Tailored interview questions in details
        </div>
      )}
    </button>
  );
}
