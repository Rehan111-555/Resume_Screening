"use client";
import { useEffect, useMemo, useState } from "react";
import type { Candidate } from "@/types";

type Props = { candidate: Candidate | null };

export default function CandidateDetail({ candidate }: Props) {
  const [copied, setCopied] = useState(false);

  const fallbackText = useMemo(() => {
    if (!candidate) return "";
    const parts: string[] = [];
    parts.push(`## Candidate Details — **${candidate.name || "Unknown"}**`);
    parts.push("");
    parts.push("**Personal Information**");
    parts.push(`* Email: ${candidate.email || "Not specified"}`);
    parts.push(`* Phone: ${candidate.phone || "Not specified"}`);
    parts.push(`* Location: ${candidate.location || "Not specified"}`);
    parts.push("");
    parts.push("**Professional Summary**");
    parts.push(candidate.summary || "—");
    return parts.join("\n");
  }, [candidate]);

  async function copyFormatted() {
    try {
      const text = candidate?.formatted || fallbackText;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  if (!candidate) return null;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Candidate Details</h2>
        <button onClick={copyFormatted} className="text-sm px-3 py-1 rounded-lg border">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6 mt-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Personal Information</h3>
          <div className="text-sm text-gray-800 space-y-1">
            <div>Email: {candidate.email || "Not specified"}</div>
            <div>Phone: {candidate.phone || "Not specified"}</div>
            <div>Location: {candidate.location || "Not specified"}</div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Professional Summary</h3>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{candidate.summary || "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-6">
        <Stat label="Overall Match" value={`${candidate.matchScore}%`} />
        <Stat label="Experience" value={`${candidate.yearsExperience || 0} ${candidate.yearsExperience === 1 ? "year" : "years"}`} />
        <Stat label="Skills & Evidence" value={`${candidate.skillsEvidencePct || 0}%`} />
        <Stat label="Education" value={candidate.education || "—"} />
      </div>

      {candidate.skills?.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Skills</h3>
          <div className="flex flex-wrap gap-2">
            {candidate.skills.map((s, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {!candidate.domainMismatch && candidate.questions && candidate.questions.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">AI Interview Questions</h3>
          <ol className="list-decimal pl-5 text-sm space-y-1">
            {candidate.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
