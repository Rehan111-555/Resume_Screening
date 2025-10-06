"use client";

import { useMemo, useState } from "react";
import { Clipboard, X } from "lucide-react";
import type { Candidate } from "@/types";

type Props = {
  candidate: Candidate | null;
  /** Optional: if provided and false, the component renders null (for modal usage) */
  isOpen?: boolean;
  /** Optional close handler (for modal usage). Safe to omit. */
  onClose?: () => void;
};

export default function CandidateDetail({ candidate, isOpen = true, onClose }: Props) {
  // if being used as a modal: allow the parent to control visibility
  if (!isOpen) return null;

  const [copied, setCopied] = useState(false);

  const formattedText = useMemo(() => {
    if (!candidate) return "";
    // Build an easy-to-copy text block. All fields are optional-safe.
    const lines: string[] = [];
    lines.push(`## Candidate Details — ${candidate.name || "Not specified"}`);
    lines.push("");
    lines.push("**Personal Information**");
    lines.push(`* Email: ${candidate.email || "Not specified"}`);
    lines.push(`* Phone: ${candidate.phone || "Not specified"}`);
    lines.push(`* Location: ${candidate.location || "Not specified"}`);
    lines.push("");
    lines.push("**Professional Summary**");
    lines.push(candidate.summary || "—");
    lines.push("");
    lines.push("**Match Breakdown**");
    lines.push(`* Overall Match: ${candidate.matchScore ?? 0}%`);
    lines.push(
      `* Experience: ${Number.isFinite(candidate.yearsExperience) ? candidate.yearsExperience : 0} ${
        (candidate.yearsExperience ?? 0) === 1 ? "year" : "years"
      }`
    );
    lines.push(`* Skills & Evidence: ${candidate.skillsEvidencePct ?? 0}%`);
    lines.push(`* Education: ${candidate.education || "—"}`);
    lines.push("");
    lines.push("**Skills**");
    lines.push((candidate.skills || []).join(", ") || "—");
    lines.push("");
    if (!candidate.domainMismatch && (candidate.questions?.length ?? 0) > 0) {
      lines.push("**AI Interview Questions**");
      (candidate.questions || []).forEach((q, i) => lines.push(`${i + 1}. ${q}`));
      lines.push("");
    }
    lines.push("**Strengths**");
    lines.push((candidate.strengths || []).map((s) => `* ${s}`).join("\n") || "—");
    lines.push("");
    lines.push("**Areas for Improvement**");
    lines.push((candidate.weaknesses || []).map((w) => `* ${w}`).join("\n") || "—");
    lines.push("");
    lines.push("**Identified Gaps**");
    lines.push((candidate.gaps || []).map((g) => `* ${g}`).join("\n") || "—");
    lines.push("");
    lines.push("**Mentoring Needs**");
    lines.push((candidate.mentoringNeeds || []).map((m) => `* ${m}`).join("\n") || "—");
    return lines.join("\n");
  }, [candidate]);

  async function copyFormatted() {
    try {
      const text = formattedText || candidate?.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  }

  // Render nothing if no candidate (avoids null access issues)
  if (!candidate) {
    return (
      <div className="rounded-2xl border p-6 bg-white shadow-sm">
        <div className="text-gray-500">No candidate selected.</div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border p-6 bg-white shadow-sm">
      {/* Optional close button for modal usage */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-2 rounded-lg hover:bg-gray-100"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
      )}

      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">Candidate Details</h2>

        <button
          onClick={copyFormatted}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <Clipboard className="h-4 w-4" />
          {copied ? "Copied!" : "Copy as Text"}
        </button>
      </div>

      {/* Personal info + Summary */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Personal Information</h3>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>Email: {candidate.email || "Not specified"}</li>
            <li>Phone: {candidate.phone || "Not specified"}</li>
            <li>Location: {candidate.location || "Not specified"}</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Professional Summary</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {candidate.summary || "—"}
          </p>
        </div>
      </div>

      {/* Match breakdown */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Overall Match" value={`${candidate.matchScore ?? 0}%`} />
        <StatCard
          label="Experience"
          value={`${Number.isFinite(candidate.yearsExperience) ? candidate.yearsExperience : 0} ${
            (candidate.yearsExperience ?? 0) === 1 ? "year" : "years"
          }`}
        />
        <StatCard label="Skills & Evidence" value={`${candidate.skillsEvidencePct ?? 0}%`} />
        <StatCard label="Education" value={candidate.education || "—"} />
      </div>

      {/* Skills */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Skills</h3>
        {candidate.skills?.length ? (
          <div className="flex flex-wrap gap-2">
            {candidate.skills.map((s, i) => (
              <span key={i} className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs border border-indigo-200">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">—</div>
        )}
      </div>

      {/* AI Interview Questions (only if domain matches and list exists) */}
      {!candidate.domainMismatch && (candidate.questions?.length ?? 0) > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">AI Interview Questions</h3>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            {(candidate.questions || []).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths / Improvements / Gaps / Mentoring */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <ListBlock title="Strengths" items={candidate.strengths || []} />
        <ListBlock title="Areas for Improvement" items={candidate.weaknesses || []} />
        <ListBlock title="Identified Gaps" items={candidate.gaps || []} />
        <ListBlock title="Mentoring Needs" items={candidate.mentoringNeeds || []} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4 bg-gray-50">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-800">{value}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {items.length ? (
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-gray-500">—</div>
      )}
    </div>
  );
}
