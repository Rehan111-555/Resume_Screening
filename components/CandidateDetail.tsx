// components/CandidateDetail.tsx
"use client";

import type { Candidate } from "@/types";
import { useState } from "react";
import { X, Mail, Phone, MapPin, Clipboard } from "lucide-react";

type Props = {
  candidate: Candidate | null;
  onClose?: () => void;
};

export default function CandidateDetail({ candidate, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!candidate) return null;

  // Safe guards for optional fields
  const questions = Array.isArray(candidate.questions) ? candidate.questions : [];
  const strengths = Array.isArray(candidate.strengths) ? candidate.strengths : [];
  const weaknesses = Array.isArray(candidate.weaknesses) ? candidate.weaknesses : [];
  const gaps = Array.isArray(candidate.gaps) ? candidate.gaps : [];
  const mentoring = Array.isArray(candidate.mentoringNeeds) ? candidate.mentoringNeeds : [];

  async function copyFormatted() {
    try {
      const text = candidate.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  const showAnalysis = !candidate.domainMismatch; // hide advanced sections if domain doesn't match

  return (
    <div className="rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-gray-900">
            {candidate.name || "Candidate"}
          </h2>
          <p className="truncate text-sm text-gray-600">{candidate.title}</p>
        </div>

        <div className="flex items-center gap-2">
          {candidate.formatted && (
            <button
              onClick={copyFormatted}
              className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              title="Copy formatted summary"
            >
              <Clipboard className="mr-1.5 h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6 px-5 py-5">
        {/* Personal Info + Summary */}
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Personal Information</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center">
                <Mail className="mr-2 h-4 w-4 text-blue-600" />
                <span>{candidate.email || "—"}</span>
              </div>
              <div className="flex items-center">
                <Phone className="mr-2 h-4 w-4 text-emerald-600" />
                <span>{candidate.phone || "—"}</span>
              </div>
              <div className="flex items-center">
                <MapPin className="mr-2 h-4 w-4 text-rose-600" />
                <span>{candidate.location || "—"}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Professional Summary</h3>
            <p className="whitespace-pre-line text-sm leading-6 text-gray-800">
              {candidate.summary || "—"}
            </p>
          </div>
        </div>

        {/* Match Breakdown */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Match Breakdown</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-indigo-50 p-3 text-center">
              <div className="text-2xl font-bold text-indigo-700">
                {candidate.domainMismatch ? 0 : candidate.matchScore}%
              </div>
              <div className="text-sm text-indigo-800">Overall Match</div>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <div className="text-lg font-semibold text-emerald-700">
                {Number.isFinite(candidate.yearsExperience)
                  ? `${Math.max(0, candidate.yearsExperience).toFixed(1)} yrs`
                  : "—"}
              </div>
              <div className="text-sm text-emerald-800">Experience</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">
                {candidate.domainMismatch ? 0 : candidate.skillsEvidencePct}%
              </div>
              <div className="text-sm text-blue-800">Skills & Evidence</div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3 text-center">
              <div className="text-lg font-semibold text-purple-700">
                {candidate.education || "—"}
              </div>
              <div className="text-sm text-purple-800">Education</div>
            </div>
          </div>
        </div>

        {/* Skills */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {(candidate.skills || []).slice(0, 40).map((skill, i) => (
              <span
                key={`${skill}-${i}`}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800"
                title={skill}
              >
                {skill}
              </span>
            ))}
            {!candidate.skills?.length && <span className="text-sm text-gray-500">—</span>}
          </div>
        </div>

        {/* If domain mismatched, stop here with a clear message */}
        {candidate.domainMismatch && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Domain not matching. This candidate’s background doesn’t align with the JD domain,
            so deeper analysis and questions are intentionally omitted.
          </div>
        )}

        {/* Strengths / Weaknesses */}
        {showAnalysis && (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-700">Strengths</h3>
              {strengths.length ? (
                <ul className="space-y-2">
                  {strengths.map((s, i) => (
                    <li key={i} className="text-sm text-gray-800">• {s}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">—</div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-rose-700">Areas for Improvement</h3>
              {weaknesses.length ? (
                <ul className="space-y-2">
                  {weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-gray-800">• {w}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">—</div>
              )}
            </div>
          </div>
        )}

        {/* Gaps & Mentoring */}
        {showAnalysis && (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-amber-700">Identified Gaps</h3>
              {gaps.length ? (
                <ul className="space-y-2">
                  {gaps.map((g, i) => (
                    <li key={i} className="text-sm text-gray-800">• {g}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">—</div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fuchsia-700">Mentoring Needs</h3>
              {mentoring.length ? (
                <ul className="space-y-2">
                  {mentoring.map((m, i) => (
                    <li key={i} className="text-sm text-gray-800">• {m}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">—</div>
              )}
            </div>
          </div>
        )}

        {/* AI Interview Questions */}
        {showAnalysis && questions.length > 0 && (
          <div className="mt-2">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              AI Interview Questions
            </h3>
            <ul className="space-y-2">
              {questions.map((q, i) => (
                <li key={i} className="rounded-md bg-indigo-50 p-2 text-sm text-indigo-900">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
