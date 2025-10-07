"use client";

import React from "react";

type Candidate = {
  id: string;
  name: string;
  title: string;
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;
  matchScore: number;
};

export default function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{candidate.name}</h3>
          <p className="text-sm text-gray-600">{candidate.title}</p>
        </div>
        <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
          {candidate.matchScore}% match
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
        <div>
          <p className="font-medium text-gray-900">Skills & Evidence</p>
          <p>{candidate.skills.length ? "—" : "—"}</p>
        </div>
        <div>
          <p className="font-medium text-gray-900">Experience</p>
          <p>{candidate.yearsExperience} years</p>
        </div>
        <div>
          <p className="font-medium text-gray-900">Education</p>
          <p>{candidate.education || "—"}</p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-sm text-gray-700 line-clamp-4">{candidate.summary || "—"}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {candidate.skills.map((s) => (
          <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
