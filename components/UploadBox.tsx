// components/UploadBox.tsx
"use client";
import { useRef } from "react";
import type { UploadedFile } from "@/types";

function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function UploadBox({
  uploadedFiles,
  onFilesUpload,
}: {
  uploadedFiles: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function pickFiles() {
    inputRef.current?.click();
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = Array.from(e.target.files || []);
    if (!fl.length) return;

    const next: UploadedFile[] = [
      ...uploadedFiles,
      ...fl.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        file: f,
      })),
    ];
    onFilesUpload(next);
    e.target.value = "";
  }

  function removeFile(id: string) {
    onFilesUpload(uploadedFiles.filter((f) => f.id !== id));
  }

  return (
    <div className="border-2 border-dashed rounded-xl p-6">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.html"
        multiple
        className="hidden"
        onChange={onChange}
      />
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Upload resumes (PDF/DOCX/TXT/HTML)</div>
          <div className="text-sm text-gray-500">You can add multiple files.</div>
        </div>
        <button
          onClick={pickFiles}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-95"
        >
          Choose files
        </button>
      </div>

      {uploadedFiles.length > 0 && (
        <ul className="mt-4 space-y-2">
          {uploadedFiles.map((f) => (
            <li
              key={f.id}
              className={cx(
                "flex items-center justify-between rounded-lg border p-3",
                "bg-white"
              )}
            >
              <div className="truncate">{f.name}</div>
              <button
                onClick={() => removeFile(f.id)}
                className="text-sm text-rose-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
