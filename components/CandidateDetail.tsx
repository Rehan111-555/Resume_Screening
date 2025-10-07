"use client";

import { useState } from "react";
import type { Candidate } from "@/types";
import { Clipboard, ClipboardCheck } from "lucide-react";

type Props = { candidate: Candidate | null; onClose?: () => void };

export default function CandidateDetail({ candidate }: Props) {
  const [copied, setCopied] = useState(false);
  if (!candidate) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(candidate.formatted || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const dash = "—";
  const showList = (items: string[]) =>
    items && items.length ? (
      <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1">
        {items.slice(0, 12).map((x, i) => (
          <li key={i} className="text-sm text-gray-700">• {x}</li>
        ))}
      </ul>
    ) : (
      <div className="text-sm text-gray-400">{dash}</div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-semibold">Candidate Details</h2>
        <button
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 text-white px-3 py-1.5 text-sm"
        >
          {copied ? <ClipboardCheck size={16} /> : <Clipboard size={16} />}
          Copy as Text
        </button>
      </div>

      {/* top blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-xs uppercase text-gray-500">Overall Match</div>
          <div className="text-2xl font-semibold">{candidate.matchScore}%</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Experience</div>
          <div className="text-2xl font-semibold">
            {candidate.yearsExperience || 0} {candidate.yearsExperience === 1 ? "year" : "years"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Skills &amp; Evidence</div>
          <div className="text-2xl font-semibold">{candidate.skillsEvidencePct}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Personal Information</h3>
          <div className="text-sm text-gray-800">
            <div>Email: {candidate.email || dash}</div>
            <div>Phone: {candidate.phone || dash}</div>
            <div>Location: {candidate.location || dash}</div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-1">Skills</h3>
          {showList(candidate.skills || [])}

          <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-1">Identified Gaps</h3>
          {showList(candidate.gaps || [])}
        </section>

        <section className="md:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Professional Summary</h3>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {candidate.summary || dash}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Strengths</h3>
              {showList(candidate.strengths || [])}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Areas for Improvement</h3>
              {showList(candidate.weaknesses || [])}
            </div>
          </div>

          {!candidate.domainMismatch && candidate.questions && candidate.questions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">AI Interview Questions</h3>
              {showList(candidate.questions)}
            </div>
          )}

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Mentoring Needs</h3>
            {showList(candidate.mentoringNeeds || [])}
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Education</h3>
            <div className="text-sm text-gray-800">
              {candidate.education || candidate.educationSummary || dash}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
