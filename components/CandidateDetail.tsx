'use client';

import type { Candidate } from '@/types';
import { X, Download, Mail, Phone, MapPin, AlertTriangle, Clipboard } from 'lucide-react';
import { formatExperience } from '@/utils/formatExperience';
import { useState } from 'react';

interface Props {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadResume?: () => void;
}

export default function CandidateDetail({ candidate, isOpen, onClose, onDownloadResume }: Props) {
  const [copied, setCopied] = useState(false);
  if (!isOpen || !candidate) return null;

  async function copyFormatted() {
    try {
      // ✅ Use optional chaining so TS knows it's safe
      await navigator.clipboard.writeText(candidate?.formatted ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no-op */
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal>
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Candidate Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {candidate.domainNotMatching && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
              <span>Domain not matching the Job Description. Score is set to 0%.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
              <div className="space-y-3 text-gray-700 break-words">
                <div className="flex items-center">
                  <Mail className="h-5 w-5 mr-3 text-blue-500" />
                  <span>{candidate.email || 'Not specified'}</span>
                </div>
                <div className="flex items-center">
                  <Phone className="h-5 w-5 mr-3 text-green-500" />
                  <span>{candidate.phone || 'Not specified'}</span>
                </div>
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-3 text-red-500" />
                  <span>{candidate.location || 'Not specified'}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Professional Summary</h3>
              <p className="text-gray-700 leading-relaxed break-words">{candidate.summary || '—'}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Match Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-700">{candidate.matchScore}%</div>
                <div className="text-sm text-indigo-700">Overall Match</div>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <div className="text-xl font-bold text-emerald-700">
                  {formatExperience(candidate.yearsExperience)}
                </div>
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
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((s, i) => (
                <span key={`${s}-${i}`} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                  {s}
                </span>
              ))}
              {!candidate.skills?.length && <span className="text-gray-500">—</span>}
            </div>
          </div>

          {candidate.questions?.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-indigo-600">AI Interview Questions</h3>
              <ul className="space-y-2">
                {candidate.questions.map((q, i) => (
                  <li key={i} className="p-3 bg-indigo-50 rounded text-indigo-900 break-words">{q}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-emerald-600">Strengths</h3>
              <ul className="space-y-2">
                {candidate.strengths.map((s, i) => (
                  <li key={`${s}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 break-words">{s}</span>
                  </li>
                ))}
                {!candidate.strengths?.length && <li className="text-gray-500">—</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 text-rose-600">Areas for Improvement</h3>
              <ul className="space-y-2">
                {candidate.weaknesses.map((w, i) => (
                  <li key={`${w}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-rose-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 break-words">{w}</span>
                  </li>
                ))}
                {!candidate.weaknesses?.length && <li className="text-gray-500">—</li>}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-amber-600">Identified Gaps</h3>
              <ul className="space-y-2">
                {candidate.gaps.map((g, i) => (
                  <li key={`${g}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 break-words">{g}</span>
                  </li>
                ))}
                {!candidate.gaps?.length && <li className="text-gray-500">—</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 text-fuchsia-600">Mentoring Needs</h3>
              <ul className="space-y-2">
                {candidate.mentoringNeeds.map((m, i) => (
                  <li key={`${m}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-fuchsia-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700 break-words">{m}</span>
                  </li>
                ))}
                {!candidate.mentoringNeeds?.length && <li className="text-gray-500">—</li>}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-6 border-t">
          <button
            onClick={copyFormatted}
            disabled={!candidate.formatted}
            aria-disabled={!candidate.formatted}
            className={`flex items-center px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 ${!candidate.formatted ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Clipboard className="h-4 w-4 mr-2" />
            {copied ? 'Copied!' : 'Copy formatted report'}
          </button>

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
