// components/UploadBox.tsx
"use client";

import * as React from "react";
import type { UploadedFile } from "@/types";

type Props = {
  uploadedFiles: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
};

export default function UploadBox({ uploadedFiles, onFilesUpload }: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function handlePickClick() {
    inputRef.current?.click();
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const mapped: UploadedFile[] = files.map((f) => ({
      name: f.name,
      type: f.type || "application/octet-stream",
      size: f.size,
      file: f, // keep native File so the POST step can construct FormData easily
    }));

    onFilesUpload([...uploadedFiles, ...mapped]);
    // reset input so same file can be selected again if needed
    e.target.value = "";
  }

  function removeByIndex(idx: number) {
    const next = uploadedFiles.filter((_, i) => i !== idx);
    onFilesUpload(next);
  }

  return (
    <div className="border-2 border-dashed rounded-xl p-6 text-center">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.rtf,.txt"
        multiple
        onChange={handleFilesSelected}
        className="hidden"
      />

      <div className="space-y-3">
        <p className="text-gray-700">
          Drag & drop resumes here, or{" "}
          <button
            type="button"
            onClick={handlePickClick}
            className="text-indigo-600 hover:underline"
          >
            browse files
          </button>
          .
        </p>
        <p className="text-xs text-gray-500">
          Supported: PDF, DOC, DOCX, RTF, TXT (up to 100 files)
        </p>
      </div>

      {/* List of selected files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-5 text-left">
          <h4 className="font-medium mb-2">Selected files</h4>
          <ul className="divide-y border rounded-lg">
            {uploadedFiles.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-center justify-between px-4 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {f.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(f.size / 1024).toFixed(1)} KB • {f.type || "unknown"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeByIndex(i)}
                  className="text-rose-600 text-sm hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
