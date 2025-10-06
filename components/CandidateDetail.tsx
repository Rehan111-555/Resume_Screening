"use client";

import { X, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate | null;
  /** controls modal visibility */
  isOpen?: boolean;
  /** close handler for parent */
  onClose?: () => void;
};

/** simple joiner to avoid adding clsx */
function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CandidateDetail({ candidate, isOpen = false, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  // lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen || !candidate) return null;

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

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 flex items-start justify-center",
        "bg-black/30 backdrop-blur-[1px]"
      )}
      aria-modal="true"
      role="dialog"
    >
      {/* click-away background */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* modal */}
      <div
        className={cx(
          "relative z-10 mt-8 mb-8 w-full max-w-4xl",
          "rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">
              Candidate Details — {candidate.name || "—"}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {candidate.title || candidate.headline || "—"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyFormatted}
              className={cx(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm",
                "border-gray-200 text-gray-700 hover:bg-gray-50"
              )}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>

            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-6">
          {/* personal + summary */}
          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h3 className="text-sm font-semibold text-gray-900">Personal Information</h3>
              <dl className="mt-2 space-y-1 text-sm text-gray-700">
                <div>
                  <dt className="inline text-gray-500">Email: </dt>
                  <dd className="inline">{candidate.email || "Not specified"}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-500">Phone: </dt>
                  <dd className="inline">{candidate.phone || "Not specified"}</dd>
                </div>
                <div>
                  <dt className="inline text-gray-500">Location: </dt>
                  <dd className="inline">{candidate.location || "Not specified"}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-900">Professional Summary</h3>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                {candidate.summary || "—"}
              </p>
            </section>
          </div>

          {/* match breakdown */}
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-xs text-gray-500">Overall Match</div>
              <div className="text-base font-semibold">{candidate.matchScore ?? 0}%</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-xs text-gray-500">Experience</div>
              <div className="text-base font-semibold">
                {candidate.yearsExperience > 0
                  ? `${candidate.yearsExperience} ${
                      candidate.yearsExperience === 1 ? "year" : "years"
                    }`
                  : "0 months"}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-xs text-gray-500">Skills &amp; Evidence</div>
              <div className="text-base font-semibold">
                {candidate.skillsEvidencePct ?? 0}%
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-xs text-gray-500">Education</div>
              <div className="text-base font-semibold truncate">
                {candidate.education || "—"}
              </div>
            </div>
          </div>

          {/* skills */}
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">Skills</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {(candidate.skills || []).length
                ? (candidate.skills || []).map((s, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                    >
                      {s}
                    </span>
                  ))
                : <span className="text-sm text-gray-500">—</span>}
            </div>
          </section>

          {/* strengths / gaps / mentoring */}
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <section>
              <h3 className="text-sm font-semibold text-green-700">Strengths</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {(candidate.strengths || []).length
                  ? candidate.strengths!.map((s, i) => <li key={i}>{s}</li>)
                  : <li>—</li>}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-rose-700">Areas for Improvement</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {(candidate.weaknesses || []).length
                  ? candidate.weaknesses!.map((s, i) => <li key={i}>{s}</li>)
                  : <li>—</li>}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-orange-700">Identified Gaps</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {(candidate.gaps || []).length
                  ? candidate.gaps!.map((s, i) => <li key={i}>{s}</li>)
                  : <li>—</li>}
              </ul>
            </section>
          </div>

          {/* interview questions */}
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">AI Interview Questions</h3>
            <ol className="mt-2 list-decimal pl-5 text-sm text-gray-700 space-y-1">
              {(candidate.questions || []).length
                ? candidate.questions!.map((q, i) => <li key={i}>{q}</li>)
                : <li>—</li>}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
