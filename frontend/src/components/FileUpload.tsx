import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  LinearProgress,
} from '@mui/material';
import { Upload as UploadIcon } from '@mui/icons-material';
import FormAlert from './FormAlert';

interface FileUploadProps {
  patientId: number;
  onUpload: (file: File) => Promise<void>;
}

const FileUpload: React.FC<FileUploadProps> = ({ patientId, onUpload }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['.edf'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      setError('Only EDF files are allowed');
      return;
    }

    // Validate file size (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be less than 100MB');
      return;
    }

    setError('');
    setSuccess('');
    setUploading(true);

    try {
      await onUpload(file);
      setSuccess('File uploaded successfully!');
      // Reset file input
      event.target.value = '';
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Upload failed';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box>
      <input
        accept=".edf"
        style={{ display: 'none' }}
        id={`file-upload-${patientId}`}
        type="file"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      <label htmlFor={`file-upload-${patientId}`}>
        <Button
          variant="outlined"
          component="span"
          startIcon={<UploadIcon />}
          disabled={uploading}
          fullWidth
        >
          {uploading ? 'Uploading...' : 'Upload EEG File'}
        </Button>
      </label>
      
      {uploading && <LinearProgress sx={{ mt: 1 }} />}
      
      <FormAlert
        error={error}
        success={success}
        onDismiss={() => { setError(''); setSuccess(''); }}
      />
      
      <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 1 }}>
        Supported format: EDF files only (max 100MB)
      </Typography>
    </Box>
  );
};

export default FileUpload;