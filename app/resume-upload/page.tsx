'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UploadBox from '@/components/UploadBox';
import ProgressBar from '@/components/ProgressBar';
import { useApp } from '@/contexts/AppContext';
import type { UploadedFile, AnalysisResult } from '@/types';

export default function ResumeUploadPage() {
  const router = useRouter();
  const { state, dispatch } = useApp();
  const { jobRequirements, uploadedFiles, loading } = state;

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const setFiles = (files: UploadedFile[]) => {
    dispatch({ type: 'SET_UPLOADED_FILES', payload: files });
  };

  async function handleAnalyze() {
    setError(null);
    setSuccess(null);

    if (!jobRequirements) {
      setError('Please complete Job Requirements first.');
      return;
    }
    if (!uploadedFiles.length) {
      setError('Please upload at least one resume.');
      return;
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const formData = new FormData();
      formData.append('jobRequirements', JSON.stringify(jobRequirements));
      for (const f of uploadedFiles) {
        formData.append('resumes', new File([f.content], f.name, { type: f.type }));
      }

      const res = await fetch('/api/analyze-resumes', { method: 'POST', body: formData });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw.slice(0, 500));
      const data: AnalysisResult = JSON.parse(raw);

      dispatch({ type: 'SET_ANALYSIS_RESULT', payload: data });
      setSuccess(`Analyzed ${data.candidates.length} candidates.`);
      router.push('/results');
    } catch (e: any) {
      setError(e?.message || 'Failed to analyze resumes.');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <ProgressBar
        currentStep={1}
        totalSteps={3}
        labels={['Job Requirements', 'Upload Resumes', 'Results']}
      />

      <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-fuchsia-600 mb-2">
        Upload Resumes
      </h1>
      <p className="text-gray-600 mb-6">
        Upload up to 100 resumes (PDF, DOCX, DOC). We’ll evaluate them strictly against your job description — for any role.
      </p>

      <UploadBox uploadedFiles={uploadedFiles} onFilesUpload={setFiles} />

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleAnalyze}
          disabled={loading || !uploadedFiles.length || !jobRequirements}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors shadow"
        >
          {loading ? 'Analyzing…' : 'Analyze with AI'}
        </button>

        <button
          onClick={() => router.push('/job-requirements')}
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
      </div>

      {error && <div className="mt-4 text-red-600">{error}</div>}
      {success && <div className="mt-4 text-green-700">{success}</div>}
    </main>
  );
}
