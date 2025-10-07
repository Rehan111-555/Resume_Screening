// components/UploadBox.tsx
"use client";

import { useRef } from "react";
import type { UploadedFile } from "@/types";

type Props = {
  uploadedFiles: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
};

export default function UploadBox({ uploadedFiles, onFilesUpload }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPick() {
    inputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;

    const newOnes: UploadedFile[] = list.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
    }));

    onFilesUpload([...uploadedFiles, ...newOnes]);
    e.currentTarget.value = "";
  }

  function removeFile(id: string) {
    onFilesUpload(uploadedFiles.filter((u) => u.id !== id));
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPick}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-90"
        >
          Select files
        </button>
        <span className="text-sm text-gray-500">PDF / DOCX / TXT (up to 100)</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.rtf"
        className="hidden"
        onChange={onChange}
      />

      {uploadedFiles.length > 0 && (
        <ul className="mt-4 space-y-2">
          {uploadedFiles.map((u) => (
            <li key={u.id} className="flex items-center justify-between text-sm">
              <span className="truncate">{u.file.name}</span>
              <button
                type="button"
                className="text-rose-600 hover:underline"
                onClick={() => removeFile(u.id)}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
