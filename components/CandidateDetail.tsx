"use client";

import * as React from "react";
import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate | null;
  /** Optional modal state — safe to ignore if you don’t use a modal wrapper */
  isOpen?: boolean;
  onClose?: () => void;
};

export default function CandidateDetail({ candidate, isOpen, onClose }: Props) {
  // If you want to use these props to actually hide/show the component:
  if (isOpen === false) return null;
  if (!candidate) return null;

  const {
    name,
    email,
    phone,
    location,
    summary,
    matchScore,
    yearsExperience,
    skillsEvidencePct,
    education,
    skills = [],
    strengths = [],
    weaknesses = [],
    gaps = [],
    mentoringNeeds = [],
    questions = [],
  } = candidate;

  async function handleCopy() {
    try {
      const text = candidate.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  return (
    <div className="relative">
      {/* (Optional) Close button if you wire it to a modal */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-0 -top-10 rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          aria-label="Close"
        >
          ✕ Close
        </button>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Candidate Details</h2>
        <button
          onClick={handleCopy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-white text-sm hover:bg-indigo-700"
        >
          Copy as Text
        </button>
      </div>

      {/* Personal Information / Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h3 className="font-medium text-gray-900 mb-2">Personal Information</h3>
          <p className="text-sm text-gray-600">Email: {email || "Not specified"}</p>
          <p className="text-sm text-gray-600">Phone: {phone || "Not specified"}</p>
          <p className="text-sm text-gray-600">Location: {location || "Not specified"}</p>
        </section>

        <section>
          <h3 className="font-medium text-gray-900 mb-2">Professional Summary</h3>
          <p className="text-sm text-gray-700 whitespace-pre-line">{summary || "—"}</p>
        </section>
      </div>

      {/* Match Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500">Overall Match</div>
          <div className="text-2xl font-semibold">{matchScore ?? 0}%</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500">Experience</div>
          <div className="text-2xl font-semibold">
            {typeof yearsExperience === "number" ? `${yearsExperience} years` : "—"}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-gray-500">Skills & Evidence</div>
          <div className="text-2xl font-semibold">{skillsEvidencePct ?? 0}%</div>
        </div>
      </div>

      {/* Education */}
      <div className="rounded-lg border p-4 mt-4">
        <div className="text-xs text-gray-500">Education</div>
        <div className="text-base font-medium">{education || "—"}</div>
      </div>

      {/* Skills */}
      <section className="mt-6">
        <h3 className="font-medium text-gray-900 mb-2">Skills</h3>
        {skills.length ? (
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={`${s}-${i}`} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-800">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">—</p>
        )}
      </section>

      {/* Strengths / Areas for Improvement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <section>
          <h3 className="font-medium text-green-700 mb-2">Strengths</h3>
          {strengths.length ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
              {strengths.map((x, i) => (
                <li key={`str-${i}`}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">—</p>
          )}
        </section>

        <section>
          <h3 className="font-medium text-rose-700 mb-2">Areas for Improvement</h3>
          {weaknesses.length ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
              {weaknesses.map((x, i) => (
                <li key={`weak-${i}`}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">—</p>
          )}
        </section>
      </div>

      {/* Identified Gaps / Mentoring Needs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <section>
          <h3 className="font-medium text-amber-700 mb-2">Identified Gaps</h3>
          {gaps.length ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
              {gaps.map((x, i) => (
                <li key={`gap-${i}`}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">—</p>
          )}
        </section>

        <section>
          <h3 className="font-medium text-purple-700 mb-2">Mentoring Needs</h3>
          {mentoringNeeds.length ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
              {mentoringNeeds.map((x, i) => (
                <li key={`need-${i}`}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">—</p>
          )}
        </section>
      </div>

      {/* AI Interview Questions (only when domain matches) */}
      {candidate.domainMismatch ? null : questions.length ? (
        <section className="mt-6">
          <h3 className="font-medium text-gray-900 mb-2">AI Interview Questions</h3>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-800">
            {questions.map((q, i) => (
              <li key={`q-${i}`}>{q}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
