// contexts/AppContext.tsx
"use client";

import React, { createContext, useContext, useReducer, ReactNode } from "react";
import type { Candidate, AnalysisResult, JobRequirements, UploadedFile } from "@/types";

type State = {
  jobRequirements: Partial<JobRequirements>;     // never null
  uploadedFiles: UploadedFile[];
  analysisResult: AnalysisResult | null;
  loading: boolean;
};

type Action =
  | { type: "SET_JOB_REQUIREMENTS"; payload: Partial<JobRequirements> }
  | { type: "SET_UPLOADED_FILES"; payload: UploadedFile[] }
  | { type: "SET_ANALYSIS_RESULT"; payload: AnalysisResult | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "RESET" };

const initialState: State = {
  jobRequirements: {},          // ⬅️ IMPORTANT: not null
  uploadedFiles: [],
  analysisResult: null,
  loading: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_JOB_REQUIREMENTS":
      return { ...state, jobRequirements: action.payload || {} };
    case "SET_UPLOADED_FILES":
      return { ...state, uploadedFiles: action.payload || [] };
    case "SET_ANALYSIS_RESULT":
      return { ...state, analysisResult: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

const AppContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
