// components/CandidateDetail.tsx
"use client";

import { useState, useMemo } from "react";
import type { Candidate } from "@/types";
import { X, Clipboard, ClipboardCheck } from "lucide-react";

type Props = {
  candidate: Candidate | null;
  onClose?: () => void; // optional close for modal usage
};

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 min-w-[110px]">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 border border-indigo-100 mr-2 mb-2">
      {children}
    </span>
  );
}

export default function CandidateDetail({ candidate, onClose }: Props) {
  // Nothing selected -> render nothing
  if (!candidate) return null;

  const [copied, setCopied] = useState(false);

  async function copyFormatted() {
    try {
      const c = candidate;
      if (!c) return;
      const text = c.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  const experienceLabel = useMemo(() => {
    const y = candidate.yearsExperience || 0;
    return y > 0 ? `${y} year${y > 1 ? "s" : ""}` : "—";
  }, [candidate.yearsExperience]);

  const educationLabel = useMemo(() => {
    return candidate.educationSummary || candidate.education || "—";
  }, [candidate.education, candidate.educationSummary]);

  return (
    <div className="relative w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-lg p-5 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Candidate Details —{" "}
            <span className="text-gray-800">{candidate.name || "—"}</span>
          </h2>
          {candidate.title && (
            <p className="mt-1 text-sm text-gray-600">{candidate.title}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyFormatted}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {copied ? (
              <>
                <ClipboardCheck className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Clipboard className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Personal Info */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Personal Information
          </h3>
          <dl className="text-sm text-gray-700 space-y-1">
            <div className="flex gap-2">
              <dt className="w-20 text-gray-500">Email</dt>
              <dd>{candidate.email || "Not specified"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 text-gray-500">Phone</dt>
              <dd>{candidate.phone || "Not specified"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 text-gray-500">Location</dt>
              <dd>{candidate.location || "Not specified"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Professional Summary
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            {candidate.summary || "—"}
          </p>
        </div>
      </div>

      {/* Match Breakdown */}
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Match Breakdown
        </h3>
        <div className="flex flex-wrap gap-3">
          <StatPill label="Overall Match" value={`${candidate.matchScore}%`} />
          <StatPill label="Experience" value={experienceLabel} />
          <StatPill
            label="Skills & Evidence"
            value={`${candidate.skillsEvidencePct}%`}
          />
          <StatPill label="Education" value={educationLabel} />
        </div>
        {candidate.domainMismatch && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
            Domain not matching — interview questions, strengths, and gaps are
            intentionally hidden.
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Skills</h3>
        <div className="flex flex-wrap">
          {(candidate.matchedSkills?.length
            ? candidate.matchedSkills
            : candidate.skills || []
          )
            .slice(0, 40)
            .map((s, i) => (
              <Chip key={i}>{s}</Chip>
            ))}
        </div>
      </div>

      {/* AI Interview Questions */}
      {!candidate.domainMismatch && candidate.questions?.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            AI Interview Questions
          </h3>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            {candidate.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Strengths / Areas for Improvement */}
      {!candidate.domainMismatch && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-emerald-800">
              Strengths
            </h3>
            {candidate.strengths?.length ? (
              <ul className="list-disc pl-5 text-sm text-emerald-900 space-y-1">
                {candidate.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-900">—</p>
            )}
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-rose-800">
              Areas for Improvement
            </h3>
            {candidate.weaknesses?.length ? (
              <ul className="list-disc pl-5 text-sm text-rose-900 space-y-1">
                {candidate.weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-rose-900">—</p>
            )}
          </div>
        </div>
      )}

      {/* Identified Gaps / Mentoring Needs */}
      {!candidate.domainMismatch && (candidate.gaps?.length > 0 || candidate.mentoringNeeds?.length > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-amber-800">
              Identified Gaps
            </h3>
            {candidate.gaps?.length ? (
              <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
                {candidate.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-amber-900">—</p>
            )}
          </div>

          <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-fuchsia-800">
              Mentoring Needs
            </h3>
            {candidate.mentoringNeeds?.length ? (
              <ul className="list-disc pl-5 text-sm text-fuchsia-900 space-y-1">
                {candidate.mentoringNeeds.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fuchsia-900">—</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
