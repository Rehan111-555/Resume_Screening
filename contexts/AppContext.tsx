// contexts/AppContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useReducer } from "react";
import type { AnalysisResult, JobRequirements, UploadedFile } from "@/types";

type State = {
  jobRequirements: Partial<JobRequirements>;
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
  jobRequirements: {},
  uploadedFiles: [],
  analysisResult: null,
  loading: false,
};

const AppContext = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
} | null>(null);

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Hydrate from sessionStorage on first client mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawResult = sessionStorage.getItem("analysisResult");
      if (rawResult) {
        const parsed: AnalysisResult = JSON.parse(rawResult);
        dispatch({ type: "SET_ANALYSIS_RESULT", payload: parsed });
      }
      const rawJD = sessionStorage.getItem("jobRequirements");
      if (rawJD) {
        const parsed: Partial<JobRequirements> = JSON.parse(rawJD);
        dispatch({ type: "SET_JOB_REQUIREMENTS", payload: parsed });
      }
      const rawFiles = sessionStorage.getItem("uploadedFiles");
      if (rawFiles) {
        const parsed: UploadedFile[] = JSON.parse(rawFiles);
        dispatch({ type: "SET_UPLOADED_FILES", payload: parsed });
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist key slices
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "jobRequirements",
        JSON.stringify(state.jobRequirements || {})
      );
    } catch {}
  }, [state.jobRequirements]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        "uploadedFiles",
        JSON.stringify(state.uploadedFiles || [])
      );
    } catch {}
  }, [state.uploadedFiles]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (state.analysisResult) {
        sessionStorage.setItem(
          "analysisResult",
          JSON.stringify(state.analysisResult)
        );
      }
    } catch {}
  }, [state.analysisResult]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
