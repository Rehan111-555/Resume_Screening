// app/job-requirements/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/contexts/AppContext";
import type { JobRequirements } from "@/types";

export default function JobRequirementsPage() {
  const router = useRouter();
  const { dispatch, state } = useApp();

  const [title, setTitle] = useState(state.jobRequirements?.title ?? "");
  const [description, setDescription] = useState(state.jobRequirements?.description ?? "");
  const [minYears, setMinYears] = useState(state.jobRequirements?.minYearsExperience?.toString() ?? "0");
  const [education, setEducation] = useState(state.jobRequirements?.educationLevel ?? "Bachelor's");

  function handleContinue() {
    const jr: JobRequirements = {
      title: title.trim(),
      description: description.trim(),
      minYearsExperience: Number(minYears) || 0,
      educationLevel: education,
    };
    dispatch({ type: "SET_JOB_REQUIREMENTS", payload: jr });
    router.push("/resume-upload");
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-4xl font-extrabold mb-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
        Job Requirements
      </h1>
      <p className="text-gray-600 mb-8">
        Paste your JD. The AI will extract signals (skills, responsibilities, domain, education expectations) directly from your description.
      </p>

      <div className="space-y-6 bg-white p-6 rounded-2xl shadow-md border border-indigo-50">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Job Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Senior Shopify Developer"
            className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Job Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            placeholder="Paste full JD here..."
            className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Minimum Years of Experience</label>
            <input
              type="number"
              min={0}
              value={minYears}
              onChange={(e) => setMinYears(e.target.value)}
              className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Minimum Education Level</label>
            <select
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              className="w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500"
            >
              <option>High School</option>
              <option>Intermediate</option>
              <option>Bachelor's</option>
              <option>Master's</option>
              <option>PhD</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleContinue}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 text-white font-semibold shadow hover:opacity-95"
          >
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}
