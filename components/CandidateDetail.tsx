"use client";

import { useState } from "react";
import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate | null;
  onClose: () => void;
};

export default function CandidateDetail({ candidate, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  if (!candidate) return null;

  async function copyFormatted() {
    try {
      const text = candidate?.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-4xl rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Candidate Details</h2>
          <div className="space-x-2">
            <button
              onClick={copyFormatted}
              className="text-sm bg-indigo-600 text-white rounded px-3 py-1"
            >
              {copied ? "Copied!" : "Copy as Text"}
            </button>
            <button onClick={onClose} className="text-sm rounded px-3 py-1 border">
              Close
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <section>
            <h3 className="font-medium mb-2">Personal Information</h3>
            <p className="text-sm">Email: {candidate.email || "Not specified"}</p>
            <p className="text-sm">Phone: {candidate.phone || "Not specified"}</p>
            <p className="text-sm">Location: {candidate.location || "Not specified"}</p>
          </section>

          <section>
            <h3 className="font-medium mb-2">Professional Summary</h3>
            <p className="text-sm whitespace-pre-wrap">{candidate.summary || "—"}</p>
          </section>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-gray-500">Overall Match</div>
            <div className="text-2xl font-semibold">{candidate.matchScore}%</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-gray-500">Experience</div>
            <div className="text-2xl font-semibold">{candidate.yearsExperience} years</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-gray-500">Skills & Evidence</div>
            <div className="text-2xl font-semibold">{candidate.skillsEvidencePct}%</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-8">
          <section>
            <h4 className="text-sm font-semibold mb-2">Strengths</h4>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {candidate.strengths?.length ? candidate.strengths.map((s, i) => <li key={i}>{s}</li>) : <li>—</li>}
            </ul>

            <h4 className="text-sm font-semibold mt-6 mb-2">Identified Gaps</h4>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {candidate.gaps?.length ? candidate.gaps.map((s, i) => <li key={i}>{s}</li>) : <li>—</li>}
            </ul>
          </section>

          <section>
            <h4 className="text-sm font-semibold mb-2">Areas for Improvement</h4>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {candidate.weaknesses?.length ? candidate.weaknesses.map((s, i) => <li key={i}>{s}</li>) : <li>—</li>}
            </ul>

            <h4 className="text-sm font-semibold mt-6 mb-2">Mentoring Needs</h4>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {candidate.mentoringNeeds?.length ? candidate.mentoringNeeds.map((s, i) => <li key={i}>{s}</li>) : <li>—</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
