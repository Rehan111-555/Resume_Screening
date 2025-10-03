// components/CandidateDetail.tsx
"use client";

import type { Candidate } from "@/types";
import { X, Download, Mail, Phone, MapPin, HelpCircle } from "lucide-react";
import { formatExperience } from "@/utils/formatExperience";

interface CandidateDetailProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadResume?: () => void;
}

export default function CandidateDetail({ candidate, isOpen, onClose, onDownloadResume }: CandidateDetailProps) {
  if (!isOpen || !candidate) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-indigo-50">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-500 to-pink-500 bg-clip-text text-transparent">
            Candidate Details
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
              <div className="space-y-3 text-gray-700">
                <div className="flex items-center"><Mail className="h-5 w-5 mr-3 text-blue-500" /><span>{candidate.email || "Not specified"}</span></div>
                <div className="flex items-center"><Phone className="h-5 w-5 mr-3 text-green-500" /><span>{candidate.phone || "Not specified"}</span></div>
                <div className="flex items-center"><MapPin className="h-5 w-5 mr-3 text-rose-500" /><span>{candidate.location || "Not specified"}</span></div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Professional Summary</h3>
              <p className="text-gray-700">{candidate.summary}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Match Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ChipBlock label="Overall Match" value={`${candidate.matchScore}%`} color="indigo" />
              <ChipBlock label="Experience" value={formatExperience(candidate.yearsExperience)} color="green" />
              <ChipBlock label="Skills & Evidence" value={`${Math.round(candidate.matchScore * 0.5)}%`} color="purple" />
              <ChipBlock label="Education" value={candidate.education?.split(" ")[0] || "—"} color="orange" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((s, i) => (
                <span key={`${s}-${i}`} className="px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-white border rounded-full text-indigo-800 text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {candidate.questions && candidate.questions.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <HelpCircle className="h-5 w-5 mr-2 text-yellow-500" /> AI Interview Questions
              </h3>
              <ul className="space-y-2">
                {candidate.questions.map((q, i) => (
                  <li key={i} className="text-gray-700 text-sm p-2 bg-gradient-to-r from-gray-50 to-white border rounded">{q}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListPanel title="Strengths" items={candidate.strengths} color="green" />
            <ListPanel title="Areas for Improvement" items={candidate.weaknesses} color="red" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListPanel title="Identified Gaps" items={candidate.gaps} color="yellow" />
            <ListPanel title="Mentoring Needs" items={candidate.mentoringNeeds} color="purple" />
          </div>
        </div>

        <div className="flex justify-end p-6 border-t">
          <button
            onClick={onDownloadResume}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            disabled={!onDownloadResume}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Resume
          </button>
        </div>
      </div>
    </div>
  );
}

function ListPanel({ title, items, color }: { title: string; items: string[]; color: "green" | "red" | "yellow" | "purple" }) {
  const dot =
    color === "green" ? "bg-green-500" :
    color === "red" ? "bg-red-500" :
    color === "yellow" ? "bg-yellow-500" : "bg-purple-500";
  const titleColor =
    color === "green" ? "text-green-600" :
    color === "red" ? "text-red-600" :
    color === "yellow" ? "text-yellow-600" : "text-purple-600";

  return (
    <div>
      <h3 className={`text-lg font-semibold mb-4 ${titleColor}`}>{title}</h3>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={`${t}-${i}`} className="flex items-start">
            <div className={`w-2 h-2 ${dot} rounded-full mt-2 mr-3 flex-shrink-0`} />
            <span className="text-gray-700">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChipBlock({ label, value, color }: { label: string; value: string; color: "indigo" | "green" | "purple" | "orange" }) {
  const col =
    color === "indigo" ? "text-indigo-600 bg-indigo-50" :
    color === "green" ? "text-green-600 bg-green-50" :
    color === "purple" ? "text-purple-600 bg-purple-50" : "text-orange-600 bg-orange-50";
  return (
    <div className={`text-center p-4 rounded-xl ${col}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm">{label}</div>
    </div>
  );
}
