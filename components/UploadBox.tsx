"use client";

import { useCallback } from "react";
import type { UploadedFile } from "@/types";

type Props = {
  uploadedFiles: UploadedFile[];
  onFilesUpload: (files: UploadedFile[]) => void;
};

export default function UploadBox({ uploadedFiles, onFilesUpload }: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list) return;

      const next: UploadedFile[] = [...uploadedFiles];
      for (let i = 0; i < list.length; i++) {
        const f = list.item(i)!;
        next.push({
          id: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
          file: f,
        });
      }
      onFilesUpload(next);
      e.currentTarget.value = ""; // reset
    },
    [uploadedFiles, onFilesUpload]
  );

  const removeFile = (id: string) => {
    onFilesUpload(uploadedFiles.filter((f) => f.id !== id));
  };

  return (
    <div className="rounded-xl border border-dashed p-6">
      <input type="file" multiple onChange={handleChange} className="mb-3" />
      <ul className="space-y-1 text-sm">
        {uploadedFiles.map((f) => (
          <li key={f.id} className="flex items-center justify-between">
            <span className="truncate">{f.name}</span>
            <button onClick={() => removeFile(f.id)} className="text-red-600 hover:underline">Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
