'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import ProgressBar from '@/components/ProgressBar';

export default function JobRequirementsPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const [title, setTitle] = useState(state.jobRequirements?.title ?? '');
  const [description, setDescription] = useState(state.jobRequirements?.description ?? '');
  const [minYears, setMinYears] = useState<number>(state.jobRequirements?.minYearsExperience ?? 0);
  const [education, setEducation] = useState(state.jobRequirements?.educationLevel ?? 'None');
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (!title.trim() || !description.trim()) {
      setError('Please add a Job Title and a Job Description.');
      return;
    }
    dispatch({
      type: 'SET_JOB_REQUIREMENTS',
      payload: {
        title: title.trim(),
        description: description.trim(),
        requiredSkills: [], // we no longer ask for this
        minYearsExperience: Number(minYears) || 0,
        educationLevel: education,
      },
    });
    router.push('/resume-upload');
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <ProgressBar
        currentStep={0}
        totalSteps={3}
        labels={['Job Requirements', 'Upload Resumes', 'Results']}
      />

      <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-fuchsia-600 mb-2">
        Job Requirements
      </h1>
      <p className="text-gray-600 mb-6">
        We’ll evaluate candidates <span className="font-semibold">strictly by your Job Description</span>. No manual skills list required.
      </p>

      <div className="space-y-6 bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Senior Payroll Specialist"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Job Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the role, responsibilities, tools, and must-haves in natural language…"
            rows={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            We’ll infer skills and synonyms automatically for any role (HR, Finance, Design, Compliance, Tech, etc.).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum Years of Experience (optional)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={minYears}
              onChange={(e) => setMinYears(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-sm text-gray-800 w-16 text-right">{minYears} yr</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum Education Level (optional)
          </label>
          <select
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option>None</option>
            <option>High School</option>
            <option>Bachelor</option>
            <option>Master</option>
            <option>PhD</option>
          </select>
        </div>

        {error && <div className="text-red-600">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => router.push('/')}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleNext}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow"
          >
            Continue
          </button>
        </div>
      </div>
    </main>
  );
}
