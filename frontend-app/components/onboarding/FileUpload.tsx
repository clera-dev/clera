"use client";

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, File as FileIcon } from 'lucide-react';

interface FileUploadProps {
  onFileChange: (base64: string | null) => void;
  acceptedFileType?: string;
  label: string;
}

export function FileUpload({ onFileChange, acceptedFileType = "application/pdf", label }: FileUploadProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== acceptedFileType) {
        setError(`Invalid file type. Please upload a ${acceptedFileType.split('/')[1].toUpperCase()} file.`);
        setFileName(null);
        onFileChange(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError("File size exceeds 5MB. Please upload a smaller file.");
        setFileName(null);
        onFileChange(null);
        return;
      }
      
      setError(null);
      setFileName(file.name);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        onFileChange(base64);
      };
      reader.readAsDataURL(file);
    }
  }, [onFileChange, acceptedFileType]);

  const handleClearFile = useCallback(() => {
    setFileName(null);
    onFileChange(null);
    const input = document.getElementById('file-upload') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  }, [onFileChange]);

  return (
    <div className="space-y-2">
      <Label htmlFor="file-upload" className="font-medium">{label}</Label>
      <div className="flex items-center space-x-2">
        <div className="relative flex-grow min-w-0">
          <input
            id="file-upload"
            type="file"
            accept={acceptedFileType}
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex items-center justify-center w-full h-12 px-3 py-2 text-sm border rounded-md border-input bg-background ring-offset-background">
            {fileName ? (
              <div className="flex items-center w-full">
                <FileIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="flex-grow truncate">{fileName}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Select a PDF file (max 5MB)</span>
            )}
          </div>
        </div>
        {fileName && (
          <Button type="button" variant="outline" size="icon" onClick={handleClearFile} className="border-border/40">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
} 