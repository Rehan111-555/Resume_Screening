import { Candidate } from '@/types';

export function exportToCSV(candidates: Candidate[]) {
  const headers = [
    'Rank',
    'Name',
    'Email',
    'Phone',
    'Title',
    'Match Score',
    'Years Experience',
    'Education',
    'Skills',
    'Strengths',
    'Weaknesses',
    'DomainMismatch'
  ];

  const csvData = candidates.map((candidate, index) => [
    index + 1,
    candidate.name,
    candidate.email,
    candidate.phone,
    candidate.title,
    `${candidate.matchScore}%`,
    candidate.yearsExperience,
    candidate.education,
    candidate.skills.join('; '),
    (candidate.strengths || []).join('; '),
    (candidate.weaknesses || []).join('; '),
    candidate.domainMismatch ? "Yes" : "No"
  ]);

  const csvContent = [headers, ...csvData]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'candidate_rankings.csv';
  link.click();
  window.URL.revokeObjectURL(url);
}
