'use client';

import type { Candidate } from '@/types';
import { GraduationCap, Briefcase, HelpCircle } from 'lucide-react';
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
  const scoreColor =
    candidate.matchScore >= 80 ? 'bg-emerald-100 text-emerald-700' :
    candidate.matchScore >= 60 ? 'bg-amber-100 text-amber-700' :
    'bg-rose-100 text-rose-700';

  const qPreview = (candidate.questions || []).slice(0, 2);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl p-4 transition-all border ${
        isSelected ? 'border-indigo-500 shadow-[0_10px_25px_-15px_rgba(59,130,246,0.7)]' : 'border-slate-200 hover:shadow-md'
      } bg-white`}
      aria-pressed={isSelected}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-r from-fuchsia-600 to-blue-600" />
            <h3 className="font-bold text-lg text-slate-900 truncate">{candidate.name}</h3>
          </div>
          <p className="text-slate-600 truncate">{candidate.title}</p>
        </div>
        <div className={`px-3 py-1 rounded-full font-semibold shrink-0 ${scoreColor}`}>
          {candidate.matchScore}%
        </div>
      </div>

      <div className="space-y-2 mb-3 text-sm text-slate-600">
        <div className="flex items-center">
          <Briefcase className="h-4 w-4 mr-2" />
          {formatExperience(candidate.yearsExperience)} experience
        </div>
        <div className="flex items-center">
          <GraduationCap className="h-4 w-4 mr-2" />
          {candidate.education || '—'}
        </div>
      </div>

      {/* Skills */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {candidate.skills.slice(0, 6).map((skill, i) => (
            <span key={`${skill}-${i}`} className="px-2 py-1 rounded-full text-xs bg-indigo-50 text-indigo-700">
              {skill}
            </span>
          ))}
          {candidate.skills.length > 6 && (
            <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600">
              +{candidate.skills.length - 6}
            </span>
          )}
        </div>
      </div>

      {/* Question preview */}
      {qPreview.length > 0 && (
        <div className="rounded-md border border-slate-200 p-2">
          <div className="flex items-center text-indigo-700 font-semibold text-sm mb-1">
            <HelpCircle className="h-4 w-4 mr-1" /> AI Questions (preview)
          </div>
          <ul className="text-xs text-slate-700 list-disc ml-5 space-y-1">
            {qPreview.map((q, idx) => <li key={idx} className="line-clamp-2">{q}</li>)}
          </ul>
        </div>
      )}
    </button>
  );
}
