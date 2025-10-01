'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { JobRequirements } from '@/types';
import { ArrowRight, Plus, X } from 'lucide-react';

const educationLevels = [
  'High School',
  'Bachelor\'s Degree',
  'Master\'s Degree',
  'PhD'
];

const popularSkills = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java',
  'AWS', 'Docker', 'Kubernetes', 'SQL', 'MongoDB', 'GraphQL',
  'Git', 'CI/CD', 'Agile', 'Scrum', 'REST APIs', 'Microservices'
];

export default function JobRequirementsPage() {
  const router = useRouter();
  const { dispatch } = useApp();
  const [formData, setFormData] = useState<JobRequirements>({
    title: '',
    description: '',
    requiredSkills: [],
    minYearsExperience: 0,
    educationLevel: 'Bachelor\'s Degree'
  });
  const [customSkill, setCustomSkill] = useState('');

  const handleAddSkill = (skill: string) => {
    if (skill && !formData.requiredSkills.includes(skill)) {
      setFormData(prev => ({
        ...prev,
        requiredSkills: [...prev.requiredSkills, skill]
      }));
    }
    setCustomSkill('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      requiredSkills: prev.requiredSkills.filter(skill => skill !== skillToRemove)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_JOB_REQUIREMENTS', payload: formData });
    router.push('/resume-upload');
  };

  const isFormValid = formData.title && formData.description && formData.requiredSkills.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold gradient-text mb-4">
              Job Requirements
            </h1>
            <p className="text-gray-600 text-lg">
              Tell us about the position you're hiring for
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <div className="flex-1 h-1 bg-blue-600 mx-2"></div>
              <div className="w-8 h-8 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <div className="flex-1 h-1 bg-gray-300 mx-2"></div>
              <div className="w-8 h-8 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-8">
            {/* Job Title */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Job Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Senior Frontend Developer"
                required
              />
            </div>

            {/* Job Description */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Job Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe the role, responsibilities, and what you're looking for in a candidate..."
                required
              />
            </div>

            {/* Required Skills */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Required Skills *
              </label>
              
              {/* Selected Skills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {formData.requiredSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Popular Skills */}
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Popular Skills:</p>
                <div className="flex flex-wrap gap-2">
                  {popularSkills.map((skill) => (
                    <button
                      type="button"
                      key={skill}
                      onClick={() => handleAddSkill(skill)}
                      disabled={formData.requiredSkills.includes(skill)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Skill Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                  placeholder="Add custom skill..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleAddSkill(customSkill)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </button>
              </div>
            </div>

            {/* Experience & Education */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Minimum Years Experience */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Minimum Years of Experience: {formData.minYearsExperience}
                </label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={formData.minYearsExperience}
                  onChange={(e) => setFormData(prev => ({ ...prev, minYearsExperience: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Entry (0)</span>
                  <span>Senior (20+)</span>
                </div>
              </div>

              {/* Education Level */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Minimum Education Level
                </label>
                <select
                  value={formData.educationLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, educationLevel: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {educationLevels.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!isFormValid}
                className="flex items-center px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
                <ArrowRight className="h-5 w-5 ml-2" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}