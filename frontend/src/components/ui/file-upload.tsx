import React from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileSelect, 
  accept = "*/*", 
  className = "" 
}) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="file-upload">Upload File</Label>
      <Input
        id="file-upload"
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="cursor-pointer"
      />
    </div>
  );
};
