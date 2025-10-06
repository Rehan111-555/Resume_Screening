"use client";

import { useState } from "react";
import type { Candidate } from "@/types";

export default function CandidateDetail({
  candidate,
}: {
  candidate: Candidate | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyFormatted() {
    try {
      const text = candidate?.formatted || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  if (!candidate) return null;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Candidate Details</h3>
        <button
          onClick={copyFormatted}
          className="text-xs px-3 py-1 rounded-md border bg-white hover:bg-gray-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6 mt-4">
        <div>
          <h4 className="font-medium text-gray-700">Personal Information</h4>
          <ul className="mt-2 space-y-1 text-sm">
            <li>Email: {candidate.email || "Not specified"}</li>
            <li>Phone: {candidate.phone || "Not specified"}</li>
            <li>Location: {candidate.location || "Not specified"}</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-gray-700">Professional Summary</h4>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
            {candidate.summary || "Not specified."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-6">
        <InfoTile label="Overall Match" value={`${candidate.matchScore}%`} />
        <InfoTile
          label="Experience"
          value={
            candidate.yearsExperience > 0
              ? `${candidate.yearsExperience} ${
                  candidate.yearsExperience === 1 ? "year" : "years"
                }`
              : "0 months"
          }
        />
        <InfoTile label="Skills & Evidence" value={`${candidate.skillsEvidencePct || 0}%`} />
        <InfoTile label="Education" value={candidate.education || "—"} />
      </div>

      {!candidate.domainMismatch && (
        <>
          <Section title="Skills">
            <ChipList items={candidate.skills || []} />
          </Section>

          <Section title="AI Interview Questions">
            <Bullets items={candidate.questions || []} />
          </Section>

          <div className="grid grid-cols-2 gap-6">
            <Section title="Strengths">
              <Bullets items={candidate.strengths || []} />
            </Section>
            <Section title="Areas for Improvement">
              <Bullets items={candidate.weaknesses || []} />
            </Section>
          </div>

          <Section title="Identified Gaps">
            <Bullets items={candidate.gaps || []} />
          </Section>
        </>
      )}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h4 className="font-medium text-gray-800 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (!items?.length) return <div className="text-sm text-gray-500">—</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x, i) => (
        <span
          key={i}
          className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
        >
          {x}
        </span>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items?.length) return <div className="text-sm text-gray-500">—</div>;
  return (
    <ul className="list-disc ml-5 text-sm space-y-1">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}
