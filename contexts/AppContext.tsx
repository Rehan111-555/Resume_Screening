'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { JobRequirements, Candidate, AnalysisResult, UploadedFile } from '@/types';

interface AppState {
  jobRequirements: JobRequirements | null;
  uploadedFiles: UploadedFile[];
  analysisResult: AnalysisResult | null;
  loading: boolean;
  currentStep: number;
}

type AppAction =
  | { type: 'SET_JOB_REQUIREMENTS'; payload: JobRequirements }
  | { type: 'SET_UPLOADED_FILES'; payload: UploadedFile[] }
  | { type: 'SET_ANALYSIS_RESULT'; payload: AnalysisResult }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'RESET' };

const initialState: AppState = {
  jobRequirements: null,
  uploadedFiles: [],
  analysisResult: null,
  loading: false,
  currentStep: 0,
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_JOB_REQUIREMENTS':
      return { ...state, jobRequirements: action.payload };
    case 'SET_UPLOADED_FILES':
      return { ...state, uploadedFiles: action.payload };
    case 'SET_ANALYSIS_RESULT':
      return { ...state, analysisResult: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'NEXT_STEP':
      return { ...state, currentStep: state.currentStep + 1 };
    case 'PREV_STEP':
      return { ...state, currentStep: state.currentStep - 1 };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}