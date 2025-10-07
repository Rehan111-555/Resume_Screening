// components/UploadBox.tsx
"use client";

import React, { useRef, useState, useCallback } from "react";
import type { UploadedFile } from "@/types";

type Props = {
  uploadedFiles: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
};

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function UploadBox({ uploadedFiles, onFilesUpload }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isOver, setIsOver] = useState(false);

  const processFiles = useCallback(
    async (files: File[]) => {
      setErr(null);
      if (!files.length) return;
      setBusy(true);
      try {
        const next: UploadedFile[] = [...uploadedFiles];
        for (const f of files) {
          const buf = await f.arrayBuffer();
          next.push({
            id: uid(),
            name: f.name,
            type: f.type || "application/octet-stream",
            size: f.size,
            content: buf,
          });
        }
        onFilesUpload(next);
      } catch (e: any) {
        setErr(e?.message || "Failed to read file(s).");
      } finally {
        setBusy(false);
      }
    },
    [uploadedFiles, onFilesUpload]
  );

  function openPicker() {
    inputRef.current?.click();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    await processFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    await processFiles(files);
  }

  function remove(id: string) {
    onFilesUpload(uploadedFiles.filter((u) => u.id !== id));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Hidden native input; triggered by button */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onPick}
        className="hidden"
      />

      {/* Dropzone + button */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          "p-6 border-b border-gray-200 transition",
          isOver ? "bg-indigo-50" : "bg-white",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-gray-900">
              Drag & drop PDF/DOCX files here
            </div>
            <div className="text-xs text-gray-500">…or click the button to pick files</div>
          </div>

          <button
            onClick={openPicker}
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Choose files
          </button>
        </div>
      </div>

      {/* Error */}
      {err && <div className="px-4 py-2 text-sm text-red-600">{err}</div>}

      {/* List */}
      <div>
        {uploadedFiles.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">
            No files added by your uploader.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {uploadedFiles.map((f) => (
              <li key={f.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{f.name}</p>
                  <p className="text-xs text-gray-500">
                    {f.type || "application/octet-stream"} • {(f.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={() => remove(f.id)}
                  className="text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {busy && (
        <div className="px-4 py-3 text-sm text-indigo-700">Reading files…</div>
      )}
    </div>
  );
}
