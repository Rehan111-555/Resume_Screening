'use client';

import type { Candidate } from '@/types';
import { X, Download, Mail, Phone, MapPin, Copy } from 'lucide-react';
import { useState } from 'react';
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
  const [copied, setCopied] = useState(false);
  if (!isOpen || !candidate) return null;

  const hideExtras = candidate.domainMismatch || candidate.matchScore === 0;

  async function copyFormatted() {
    try {
      const text = candidate?.formatted || '';
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Candidate Details</h2>
          <div className="flex gap-2">
            <button onClick={copyFormatted} className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
              <Copy className="h-5 w-5" /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
              <div className="space-y-3 text-gray-700">
                <div className="flex items-center"><Mail className="h-5 w-5 mr-3 text-blue-500" />{candidate.email || 'Not specified'}</div>
                <div className="flex items-center"><Phone className="h-5 w-5 mr-3 text-green-500" />{candidate.phone || 'Not specified'}</div>
                <div className="flex items-center"><MapPin className="h-5 w-5 mr-3 text-red-500" />{candidate.location || 'Not specified'}</div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Professional Summary</h3>
              <p className="text-gray-700 leading-relaxed">{candidate.summary}</p>
            </div>
          </div>

          {/* Match Breakdown */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Match Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-700">{candidate.matchScore}%</div>
                <div className="text-sm text-indigo-700">Overall Match</div>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <div className="text-xl font-bold text-emerald-700">{formatExperience(candidate.yearsExperience)}</div>
                <div className="text-sm text-emerald-700">Experience</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{candidate.skillsEvidencePct}%</div>
                <div className="text-sm text-blue-700">Skills & Evidence</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-xl font-bold text-purple-700">{candidate.education || '—'}</div>
                <div className="text-sm text-purple-700">Education</div>
              </div>
            </div>

            {candidate.domainMismatch && (
              <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 inline-block">
                ⚠️ Domain not matching — scoring forced to 0% and interview questions hidden.
              </div>
            )}
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((s, i) => (
                <span key={`${s}-${i}`} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-full text-sm">{s}</span>
              ))}
            </div>
          </div>

          {/* Tailored Questions */}
          {!hideExtras && candidate.questions?.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-indigo-600">AI Interview Questions</h3>
              <ul className="space-y-2">
                {candidate.questions.map((q, i) => (
                  <li key={i} className="p-3 bg-indigo-50 rounded text-indigo-900">{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-emerald-600">Strengths</h3>
              <ul className="space-y-2">
                {candidate.strengths.map((s, i) => (
                  <li key={`${s}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 mr-3" />
                    <span className="text-gray-700">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 text-rose-600">Areas for Improvement</h3>
              <ul className="space-y-2">
                {candidate.weaknesses.map((w, i) => (
                  <li key={`${w}-${i}`} className="flex items-start">
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
              <h3 className="text-lg font-semibold mb-4 text-amber-600">Identified Gaps</h3>
              <ul className="space-y-2">
                {candidate.gaps.map((g, i) => (
                  <li key={`${g}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 mr-3" />
                    <span className="text-gray-700">{g}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 text-fuchsia-600">Mentoring Needs</h3>
              <ul className="space-y-2">
                {candidate.mentoringNeeds.map((m, i) => (
                  <li key={`${m}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-fuchsia-500 rounded-full mt-2 mr-3" />
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
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
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
