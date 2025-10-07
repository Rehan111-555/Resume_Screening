// components/CandidateDetail.tsx
"use client";
import { useState } from "react";
import type { Candidate } from "@/types";

type Props = { candidate: Candidate | null; onClose?: () => void };

export default function CandidateDetail({ candidate, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  if (!candidate) return null;

  async function handleCopy() {
    try {
      const text = candidate?.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-auto p-4">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-800"
        >
          ✕ Close
        </button>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Candidate Details</h2>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm"
          >
            {copied ? "Copied" : "Copy as Text"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <section>
            <h3 className="font-semibold mb-2">Personal Information</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <div>Email: {candidate.email || "Not specified"}</div>
              <div>Phone: {candidate.phone || "Not specified"}</div>
              <div>Location: {candidate.location || "Not specified"}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Overall Match</div>
                <div className="text-lg font-semibold">{candidate.matchScore}%</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Experience</div>
                <div className="text-lg font-semibold">{candidate.yearsExperience} years</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Skills & Evidence</div>
                <div className="text-lg font-semibold">{candidate.skillsEvidencePct}%</div>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 mt-3">
              <div className="text-xs text-gray-500">Education</div>
              <div className="text-lg font-semibold">{candidate.education || "—"}</div>
              {candidate.educationSummary && (
                <div className="text-sm text-gray-600 mt-1">{candidate.educationSummary}</div>
              )}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Professional Summary</h3>
            <p className="text-gray-800 text-sm min-h-[72px]">
              {candidate.summary || "—"}
            </p>
          </section>
        </div>

        <section className="mt-6">
          <h3 className="font-semibold mb-2">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {(candidate.skills || []).map((s, i) => (
              <span key={i} className="text-xs rounded bg-gray-100 px-2 py-1">
                {s}
              </span>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <section>
            <h3 className="font-semibold mb-2 text-green-700">Strengths</h3>
            <ul className="list-disc pl-5 text-sm">
              {(candidate.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold mb-2 text-rose-700">Areas for Improvement</h3>
            <ul className="list-disc pl-5 text-sm">
              {(candidate.weaknesses || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <section>
            <h3 className="font-semibold mb-2 text-amber-700">Identified Gaps</h3>
            <ul className="list-disc pl-5 text-sm">
              {(candidate.gaps || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
          <section>
            <h3 className="font-semibold mb-2 text-purple-700">Mentoring Needs</h3>
            <ul className="list-disc pl-5 text-sm">
              {(candidate.mentoringNeeds || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        </div>

        {!candidate.domainMismatch && (candidate.questions?.length || 0) > 0 && (
          <section className="mt-6">
            <h3 className="font-semibold mb-2">AI Interview Questions</h3>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              {candidate.questions.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
