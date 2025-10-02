'use client';

import type { Candidate } from '@/types';
import { X, Download, Mail, Phone, MapPin, Star, HelpCircle } from 'lucide-react';
import { formatExperience } from '@/utils/formatExperience';

interface CandidateDetailProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadResume?: () => void;
}

export default function CandidateDetail({
  candidate,
  isOpen,
  onClose,
  onDownloadResume,
}: CandidateDetailProps) {
  if (!isOpen || !candidate) return null;

  const skillPct = Math.round(candidate.matchScore); // visual only

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-black bg-gradient-to-r from-fuchsia-600 via-blue-600 to-emerald-500 bg-clip-text text-transparent">
            Candidate Details
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold">Personal Information</h3>
              <div className="space-y-3 text-gray-700 mt-2">
                <div className="flex items-center"><Mail className="h-5 w-5 mr-3 text-blue-500" /> <span>{candidate.email || 'Not specified'}</span></div>
                <div className="flex items-center"><Phone className="h-5 w-5 mr-3 text-green-500" /> <span>{candidate.phone || 'Not specified'}</span></div>
                <div className="flex items-center"><MapPin className="h-5 w-5 mr-3 text-rose-500" /> <span>{candidate.location || 'Not specified'}</span></div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold">Professional Summary</h3>
              <p className="text-gray-700 mt-2">{candidate.summary}</p>
            </div>
          </div>

          {/* Match Breakdown */}
          <div>
            <h3 className="text-lg font-semibold">Match Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-700">{candidate.matchScore}%</div>
                <div className="text-sm text-indigo-700">Overall Match</div>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <div className="text-2xl font-bold text-emerald-700">
                  {formatExperience(candidate.yearsExperience)}
                </div>
                <div className="text-sm text-emerald-700">Experience</div>
              </div>
              <div className="text-center p-4 bg-fuchsia-50 rounded-lg">
                <div className="text-2xl font-bold text-fuchsia-700">{skillPct}%</div>
                <div className="text-sm text-fuchsia-700">Skills & Evidence</div>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <div className="text-2xl font-bold text-amber-700">{candidate.education?.split(' ')[0] || '—'}</div>
                <div className="text-sm text-amber-700">Education</div>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-lg font-semibold">Skills</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              {candidate.skills.map((s, i) => (
                <span key={`${s}-${i}`} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* AI Questions */}
          {candidate.questions?.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold flex items-center text-indigo-700">
                <HelpCircle className="h-5 w-5 mr-2" /> AI Interview Questions
              </h3>
              <ul className="mt-2 space-y-2">
                {candidate.questions.map((q, i) => (
                  <li key={i} className="p-3 bg-indigo-50 text-indigo-900 rounded">{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-emerald-700 flex items-center"><Star className="h-5 w-5 mr-2"/>Strengths</h3>
              <ul className="space-y-2 mt-2">
                {candidate.strengths.map((s, i) => (
                  <li key={i} className="flex items-start">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 mr-3" />
                    <span className="text-gray-700">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-rose-700">Areas for Improvement</h3>
              <ul className="space-y-2 mt-2">
                {candidate.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start">
                    <div className="w-2 h-2 bg-rose-500 rounded-full mt-2 mr-3" />
                    <span className="text-gray-700">{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Gaps & Mentoring */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-amber-700">Identified Gaps</h3>
              <ul className="space-y-2 mt-2">
                {candidate.gaps.map((g, i) => (
                  <li key={i} className="flex items-start">
                    <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 mr-3" />
                    <span className="text-gray-700">{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-purple-700">Mentoring Needs</h3>
              <ul className="space-y-2 mt-2">
                {candidate.mentoringNeeds.map((m, i) => (
                  <li key={i} className="flex items-start">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3" />
                    <span className="text-gray-700">{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-end p-6 border-t">
          <button
            onClick={onDownloadResume}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
            disabled={!onDownloadResume}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Resume
          </button>
        </div>
      </div>
    </div>
  );
}
