'use client';

import type { Candidate } from '@/types';
import { X, Download, Mail, Phone, MapPin } from 'lucide-react';
import { formatExperience } from '@/utils/formatExperience';

interface CandidateDetailProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadResume?: () => void; // optional callback
}

export default function CandidateDetail({
  candidate,
  isOpen,
  onClose,
  onDownloadResume,
}: CandidateDetailProps) {
  if (!isOpen || !candidate) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-details-title"
    >
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 id="candidate-details-title" className="text-2xl font-bold text-gray-900">
            Candidate Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
              <div className="space-y-3 text-gray-700">
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
              <p className="text-gray-700">{candidate.summary}</p>
            </div>
          </div>

          {/* Match Breakdown */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Match Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{candidate.matchScore}%</div>
                <div className="text-sm text-blue-600">Overall Match</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {formatExperience(candidate.yearsExperience)}
                </div>
                <div className="text-sm text-green-600">Experience</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(candidate.matchScore * 0.4)}%
                </div>
                <div className="text-sm text-purple-600">Skills Match</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {candidate.education?.split(' ')[0] || '—'}
                </div>
                <div className="text-sm text-orange-600">Education</div>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill, index) => (
                <span
                  key={`${skill}-${index}`}
                  className="px-3 py-2 bg-blue-100 text-blue-800 rounded-full text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-green-600">Strengths</h3>
              <ul className="space-y-2">
                {candidate.strengths.map((s, i) => (
                  <li key={`${s}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 text-red-600">Areas for Improvement</h3>
              <ul className="space-y-2">
                {candidate.weaknesses.map((w, i) => (
                  <li key={`${w}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Gaps & Mentoring */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 text-yellow-600">Identified Gaps</h3>
              <ul className="space-y-2">
                {candidate.gaps.map((g, i) => (
                  <li key={`${g}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 mr-3 flex-shrink-0" />
                    <span className="text-gray-700">{g}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 text-purple-600">Mentoring Needs</h3>
              <ul className="space-y-2">
                {candidate.mentoringNeeds.map((m, i) => (
                  <li key={`${m}-${i}`} className="flex items-start">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0" />
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
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
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
