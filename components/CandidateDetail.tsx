// components/CandidateDetail.tsx
"use client";

import * as React from "react";
import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate | null;
  /** Optional; kept for compatibility with app/results/page.tsx */
  isOpen?: boolean;
  /** Optional; kept for compatibility with app/results/page.tsx */
  onClose?: () => void;
};

export default function CandidateDetail({ candidate, isOpen = true, onClose }: Props) {
  const [copied, setCopied] = React.useState(false);

  if (!candidate || !isOpen) return null;

  async function handleCopy() {
    try {
      const text = candidate?.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Candidate Details</h2>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:opacity-95"
            >
              {copied ? "Copied!" : "Copy as Text"}
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Left: personal/score */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700">Personal Information</h3>
              <div className="mt-2 text-sm text-gray-600">
                <div>Email: {candidate.email || "Not specified"}</div>
                <div>Phone: {candidate.phone || "Not specified"}</div>
                <div>Location: {candidate.location || "Not specified"}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Overall Match</div>
                <div className="text-2xl font-semibold">{Math.round(candidate.matchScore)}%</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Experience</div>
                <div className="text-2xl font-semibold">
                  {candidate.yearsExperience} {candidate.yearsExperience === 1 ? "year" : "years"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Skills & Evidence</div>
                <div className="text-2xl font-semibold">{candidate.skillsEvidencePct}%</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Education</div>
                <div className="text-2xl font-semibold">{candidate.education || "—"}</div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700">Skills</h3>
              <div className="mt-2 text-sm text-gray-700">
                {candidate.skills?.length ? candidate.skills.join(", ") : "—"}
              </div>
            </div>
          </div>

          {/* Right: summary */}
          <div>
            <h3 className="text-sm font-medium text-gray-700">Professional Summary</h3>
            <div className="mt-2 whitespace-pre-wrap rounded-lg border p-3 text-sm text-gray-700">
              {candidate.summary || "—"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-emerald-700">Strengths</h3>
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {(candidate.strengths || []).length
                ? candidate.strengths.map((s, i) => <li key={i}>{s}</li>)
                : <li>—</li>}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-rose-700">Areas for Improvement</h3>
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {(candidate.weaknesses || []).length
                ? candidate.weaknesses.map((s, i) => <li key={i}>{s}</li>)
                : <li>—</li>}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-amber-700">Identified Gaps</h3>
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {(candidate.gaps || []).length ? candidate.gaps.map((g, i) => <li key={i}>{g}</li>) : <li>—</li>}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-purple-700">Mentoring Needs</h3>
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {(candidate.mentoringNeeds || []).length
                ? candidate.mentoringNeeds.map((m, i) => <li key={i}>{m}</li>)
                : <li>—</li>}
            </ul>
          </div>
        </div>

        {/* Optional questions */}
        {!!candidate.questions?.length && !candidate.domainMismatch && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">AI Interview Questions</h3>
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {candidate.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
