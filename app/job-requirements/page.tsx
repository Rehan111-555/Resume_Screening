'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';

export default function JobRequirementsPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();

  const [title, setTitle] = useState(state.jobRequirements?.title || '');
  const [description, setDescription] = useState(state.jobRequirements?.description || '');
  const [minYears, setMinYears] = useState<number>(
    Number(state.jobRequirements?.minYearsExperience || 0)
  );
  const [education, setEducation] = useState<string>(
    state.jobRequirements?.educationLevel || 'Bachelor'
  );

  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    setError(null);
    if (!title.trim() || !description.trim()) {
      setError('Please provide both a Job Title and a Job Description.');
      return;
    }

    dispatch({
      type: 'SET_JOB_REQUIREMENTS',
      payload: {
        title: title.trim(),
        description: description.trim(),
        minYearsExperience: Number(minYears) || 0,
        educationLevel: education,
      },
    });

    router.push('/resume-upload');
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent mb-2">
        Job Requirements
      </h1>
      <p className="text-gray-600 mb-6">
        Paste the JD. The AI will extract competencies and score resumes strictly against this text.
      </p>

      <div className="space-y-5 bg-white rounded-2xl shadow p-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Job Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Senior Compliance Analyst"
            className="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Job Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            placeholder="Paste the full JD here (responsibilities, tools, domain, must-haves...)."
            className="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Minimum Years of Experience
            </label>
            <input
              type="number"
              min={0}
              value={minYears}
              onChange={(e) => setMinYears(Number(e.target.value))}
              className="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Minimum Education Level
            </label>
            <select
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              className="w-full rounded-lg border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option>Intermediate/High School</option>
              <option>Bachelor</option>
              <option>Master</option>
              <option>PhD</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="mt-4 text-red-600">{error}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleContinue}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </main>
  );
}
