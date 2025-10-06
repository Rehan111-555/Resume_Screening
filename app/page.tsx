'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';

export default function Home() {
  const router = useRouter();
  const { dispatch } = useApp();

  const handleGetStarted = () => {
    dispatch({ type: 'RESET' });
    router.push('/job-requirements');
  };

  return (
    <div className="min-h-screen gradient-bg">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center text-white">
          <h1 className="text-5xl font-bold mb-6">AI Resume Screener</h1>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Upload any format (PDF/DOC) and get consistent, deterministic rankings against your JD.
          </p>
          <button
            onClick={handleGetStarted}
            className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
