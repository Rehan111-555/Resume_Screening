'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X } from 'lucide-react';
import { UploadedFile } from '@/types';

interface UploadBoxProps {
  onFilesUpload: (files: UploadedFile[]) => void;
  uploadedFiles: UploadedFile[];
}

export default function UploadBox({ onFilesUpload, uploadedFiles }: UploadBoxProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newUploadedFiles: UploadedFile[] = await Promise.all(
      acceptedFiles.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        return {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          size: file.size,
          content: arrayBuffer,
        };
      })
    );

    onFilesUpload([...uploadedFiles, ...newUploadedFiles]);
  }, [onFilesUpload, uploadedFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 100,
  });

  const removeFile = (id: string) => {
    onFilesUpload(uploadedFiles.filter(file => file.id !== id));
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <p className="text-lg font-semibold text-gray-700">
            Drag and drop resumes here, or click to select
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Supports PDF and DOCX files (Max: 100 files)
          </p>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Uploaded Files ({uploadedFiles.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-white border rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <File className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
