// components/UploadBox.tsx
"use client";

import React, { useRef, useState } from "react";
import type { UploadedFile } from "@/types";

type Props = {
  uploadedFiles: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
};

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function UploadBox({ uploadedFiles, onFilesUpload }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setBusy(true);
    try {
      const next: UploadedFile[] = [...uploadedFiles];

      for (const f of files) {
        // Read file bytes into ArrayBuffer
        const buf = await f.arrayBuffer();

        next.push({
          id: uid(),
          name: f.name,
          type: f.type || "application/octet-stream",
          size: f.size,
          // store raw bytes according to our type
          content: buf,
        });
      }

      onFilesUpload(next);
      // clear the input so the same file can be chosen again if needed
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      setErr(e?.message || "Failed to read file(s).");
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    const next = uploadedFiles.filter((u) => u.id !== id);
    onFilesUpload(next);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="p-4 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handlePick}
          className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700"
          disabled={busy}
        />
      </div>

      {err && <div className="px-4 pb-2 text-sm text-red-600">{err}</div>}

      <div className="border-t border-gray-200">
        {uploadedFiles.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">
            No files added yet. Choose PDF or DOCX (you can select multiple).
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
