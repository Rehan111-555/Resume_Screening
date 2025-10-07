// components/CandidateDetail.tsx
"use client";

import { useState } from "react";
import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate | null;
  isOpen?: boolean;
  onClose?: () => void;
};

export default function CandidateDetail({ candidate, isOpen = true, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  // Do not render anything if no candidate or closed
  if (!isOpen || !candidate) return null;

  async function handleCopy() {
    try {
      // <- FIX: optional chaining avoids the "possibly null" error
      const text = candidate?.formatted ?? "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  const qCount = candidate?.questions?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Candidate Details</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
            >
              {copied ? "Copied!" : "Copy as Text"}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
            >
              Close
            </button>
          </div>
        </div>

        {/* Top summary row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="col-span-1">
            <div className="text-sm text-gray-500">Personal Information</div>
            <div className="text-sm mt-2">Email: {candidate?.email || "Not specified"}</div>
            <div className="text-sm">Phone: {candidate?.phone || "Not specified"}</div>
            <div className="text-sm">Location: {candidate?.location || "Not specified"}</div>
          </div>

          <div className="col-span-3">
            <div className="text-sm text-gray-500">Professional Summary</div>
            <p className="text-sm mt-2 whitespace-pre-wrap">{candidate?.summary || "—"}</p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <Metric title="Overall Match" value={`${candidate?.matchScore ?? 0}%`} />
          <Metric title="Experience" value={`${candidate?.yearsExperience ?? 0} years`} />
          <Metric title="Skills & Evidence" value={`${candidate?.skillsEvidencePct ?? 0}%`} />
          <Metric title="Education" value={candidate?.education || "—"} />
        </div>

        {/* Skills */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Skills</h3>
          {candidate?.skills?.length ? (
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((s, i) => (
                <span
                  key={`${s}-${i}`}
                  className="px-2 py-1 text-xs rounded-full bg-slate-100 border border-slate-200"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">—</div>
          )}
        </section>

        {/* Strengths / Improvements / Gaps / Mentoring */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <ListBlock title="Strengths" items={candidate?.strengths} color="text-emerald-600" />
          <ListBlock title="Areas for Improvement" items={candidate?.weaknesses} color="text-rose-600" />
          <ListBlock title="Identified Gaps" items={candidate?.gaps} color="text-amber-700" />
          <ListBlock title="Mentoring Needs" items={candidate?.mentoringNeeds} color="text-fuchsia-700" />
        </div>

        {/* AI Questions – only when domain matches */}
        {!candidate?.domainMismatch && qCount > 0 && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">AI Interview Questions</h3>
            <ul className="list-disc ml-6 space-y-1">
              {candidate?.questions!.map((q, i) => (
                <li key={i} className="text-sm">
                  {q}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function ListBlock({
  title,
  items,
  color,
}: {
  title: string;
  items?: string[];
  color?: string;
}) {
  return (
    <div>
      <h3 className={`text-sm font-semibold ${color || ""} mb-2`}>{title}</h3>
      {items?.length ? (
        <ul className="list-disc ml-6 space-y-1 text-sm">
          {items.map((s, i) => (
            <li key={`${s}-${i}`}>{s}</li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-gray-400">—</div>
      )}
    </div>
  );
}
