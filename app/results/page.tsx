'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import CandidateCard from '@/components/CandidateCard';
import CandidateDetail from '@/components/CandidateDetail';
import { Candidate } from '@/types';
import { Download, Filter, ArrowLeft } from 'lucide-react';
import { exportToCSV } from '@/utils/exportCSV';

type SortField = 'matchScore' | 'yearsExperience' | 'education';
type SortOrder = 'asc' | 'desc';

export default function ResultsPage() {
  const { state, dispatch } = useApp();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('matchScore');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterEducation, setFilterEducation] = useState('');

  const sortedCandidates = useMemo(() => {
    if (!state.analysisResult?.candidates) return [];
    let filtered = [...state.analysisResult.candidates];

    if (filterEducation) {
      filtered = filtered.filter(c =>
        (c.education || '').toLowerCase().includes(filterEducation.toLowerCase())
      );
    }

    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'education') {
        const order = ['High School', 'Intermediate', 'Bachelor', 'Master', 'MS', 'MSc', 'PhD'];
        aValue = order.findIndex(l => (a.education || '').includes(l));
        bValue = order.findIndex(l => (b.education || '').includes(l));
      }

      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    return filtered;
  }, [state.analysisResult?.candidates, sortField, sortOrder, filterEducation]);

  const handleCandidateClick = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsDetailOpen(true);
  };

  const handleExport = () => {
    if (state.analysisResult?.candidates) {
      exportToCSV(state.analysisResult.candidates);
    }
  };

  if (!state.analysisResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <button
                onClick={() => dispatch({ type: 'RESET' })}
                className="flex items-center text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Start Over
              </button>
              <h1 className="text-4xl font-bold gradient-text">Candidate Rankings</h1>
              <p className="text-gray-600 mt-2">
                {sortedCandidates.length} candidates analyzed by AI
              </p>
            </div>

            <button
              onClick={handleExport}
              className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </button>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center">
                <Filter className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700 mr-2">Sort by:</span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="border border-gray-300 rounded px-3 py-1 text-sm"
                >
                  <option value="matchScore">Match Score</option>
                  <option value="yearsExperience">Experience</option>
                  <option value="education">Education</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="border border-gray-300 rounded px-3 py-1 text-sm ml-2"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>

              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-700 mr-2">Filter Education:</span>
                <input
                  type="text"
                  value={filterEducation}
                  onChange={(e) => setFilterEducation(e.target.value)}
                  placeholder="e.g., Master, Bachelor..."
                  className="border border-gray-300 rounded px-3 py-1 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Candidate Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                isSelected={selectedCandidate?.id === candidate.id}
                onClick={() => handleCandidateClick(candidate)}
              />
            ))}
          </div>

          {sortedCandidates.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No candidates match your filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* Candidate Detail Panel */}
      <CandidateDetail
        candidate={selectedCandidate}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </div>
  );
}
