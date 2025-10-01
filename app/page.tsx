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
          <h1 className="text-5xl font-bold mb-6">
            AI Resume Screener
          </h1>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Streamline your hiring process with AI-powered resume analysis, 
            candidate ranking, and intelligent interview question generation.
          </p>
          <button
            onClick={handleGetStarted}
            className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors"
          >
            Get Started
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-16 max-w-6xl mx-auto">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-white">
            <div className="text-2xl font-bold mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Smart Screening</h3>
            <p>AI analyzes resumes against your specific job requirements with precision.</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-white">
            <div className="text-2xl font-bold mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">Candidate Ranking</h3>
            <p>Get detailed match scores and comprehensive candidate analysis.</p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-white">
            <div className="text-2xl font-bold mb-4">❓</div>
            <h3 className="text-xl font-semibold mb-2">AI Questions</h3>
            <p>Automatically generate tailored interview questions for each candidate.</p>
          </div>
        </div>
      </div>
    </div>
  );
}