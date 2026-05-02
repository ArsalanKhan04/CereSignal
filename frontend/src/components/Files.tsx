import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { SignalFile, Signal } from '../types';

const Files: React.FC = () => {
  const [files, setFiles] = useState<SignalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<string>('all');
  const [selectedFile, setSelectedFile] = useState<SignalFile | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  // Poll for status updates on files that are processing
  useEffect(() => {
    const processingFiles = files.filter(file => file.condition === 'processing');
    
    if (processingFiles.length === 0) {
      setPolling(false);
      return;
    }

    setPolling(true);
    const pollInterval = setInterval(async () => {
      for (const file of processingFiles) {
        try {
          const response = await apiClient.checkInferenceStatus(file.id);
          if (response.status === 200 && response.data) {
            // Update the file status if it has changed
            setFiles((prevFiles) =>
              prevFiles.map((f) =>
                f.id === file.id
                  ? {
                      ...f,
                      condition: response.data.condition as SignalFile['condition'],
                      processing_status: response.data.inference_status as SignalFile['processing_status'],
                    }
                  : f
              )
            );
          }
        } catch (err) {
          console.error('Error checking inference status:', err);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(pollInterval);
      setPolling(false);
    };
  }, [files]);

  const loadFiles = async () => {
    try {
      const response = await apiClient.getFiles();
      if (response.status === 200) {
        setFiles(response.data);
      } else {
        setError('Failed to load files');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading files';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const handleViewFile = async (file: SignalFile) => {
    // Open EDF viewer in new tab with file serving URL
    const fileUrl = `${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1'}/signals/files/serve?file_path=${encodeURIComponent(file.file_path)}`;
    const viewerUrl = `/edf-viewer/viewer.html?file=${encodeURIComponent(fileUrl)}`;
    window.open(viewerUrl, '_blank');
  };

  const handleDeleteFile = async (fileId: number) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        await apiClient.deleteFile(fileId);
        await loadFiles();
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete file';
        setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'processing': return 'info';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'normal': return 'success';
      case 'abnormal': return 'error';
      case 'processing': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getConditionIcon = (condition: string) => {
    switch (condition) {
      case 'normal': return '✅';
      case 'abnormal': return '❌';
      case 'processing': return '⏳';
      case 'failed': return '❌';
      default: return '⏳';
    }
  };

  const filteredFiles = files.filter(file => {
    if (filter === 'all') return true;
    return file.condition === filter;
  });

  const groupedFiles = {
    normal: filteredFiles.filter(f => f.condition === 'normal'),
    abnormal: filteredFiles.filter(f => f.condition === 'abnormal'),
    processing: filteredFiles.filter(f => f.condition === 'processing'),
    failed: filteredFiles.filter(f => f.condition === 'failed'),
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">All EEG Files</Typography>
        <Box display="flex" gap={2} alignItems="center">
          {polling && (
            <Chip
              icon={<CircularProgress size={16} />}
              label="Processing files..."
              color="info"
              variant="outlined"
            />
          )}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Filter</InputLabel>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              label="Filter"
            >
              <MenuItem value="all">All Files</MenuItem>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="abnormal">Abnormal</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadFiles}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {filteredFiles.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
              No files found.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box>
          {/* Normal files */}
          {groupedFiles.normal.length > 0 && (
            <Box mb={4}>
              <Typography variant="h5" color="success.main" gutterBottom>
                ✅ Normal EEG Signals ({groupedFiles.normal.length})
              </Typography>
              <Grid container spacing={2}>
                {groupedFiles.normal.map((file) => (
                  <Grid sx={{ xs: 12, sm: 6, md: 4 }} key={file.id}>
                    <FileCard
                      file={file}
                      onView={handleViewFile}
                      onDelete={handleDeleteFile}
                      getStatusColor={getStatusColor}
                      getConditionColor={getConditionColor}
                      getConditionIcon={getConditionIcon}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Abnormal files */}
          {groupedFiles.abnormal.length > 0 && (
            <Box mb={4}>
              <Typography variant="h5" color="error.main" gutterBottom>
                ❌ Abnormal EEG Signals ({groupedFiles.abnormal.length})
              </Typography>
              <Grid container spacing={2}>
                {groupedFiles.abnormal.map((file) => (
                  <Grid sx={{ xs: 12, sm: 6, md: 4 }} key={file.id}>
                    <FileCard
                      file={file}
                      onView={handleViewFile}
                      onDelete={handleDeleteFile}
                      getStatusColor={getStatusColor}
                      getConditionColor={getConditionColor}
                      getConditionIcon={getConditionIcon}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Processing files */}
          {groupedFiles.processing.length > 0 && (
            <Box mb={4}>
              <Typography variant="h5" color="warning.main" gutterBottom>
                ⏳ Processing ({groupedFiles.processing.length})
              </Typography>
              <Grid container spacing={2}>
                {groupedFiles.processing.map((file) => (
                  <Grid sx={{ xs: 12, sm: 6, md: 4 }} key={file.id}>
                    <FileCard
                      file={file}
                      onView={handleViewFile}
                      onDelete={handleDeleteFile}
                      getStatusColor={getStatusColor}
                      getConditionColor={getConditionColor}
                      getConditionIcon={getConditionIcon}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Failed files */}
          {groupedFiles.failed.length > 0 && (
            <Box mb={4}>
              <Typography variant="h5" color="error.main" gutterBottom>
                ❌ Failed Processing ({groupedFiles.failed.length})
              </Typography>
              <Grid container spacing={2}>
                {groupedFiles.failed.map((file) => (
                  <Grid sx={{ xs: 12, sm: 6, md: 4 }} key={file.id}>
                    <FileCard
                      file={file}
                      onView={handleViewFile}
                      onDelete={handleDeleteFile}
                      getStatusColor={getStatusColor}
                      getConditionColor={getConditionColor}
                      getConditionIcon={getConditionIcon}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </Box>
      )}

      {/* File Details Dialog */}
      <Dialog
        open={!!selectedFile}
        onClose={() => setSelectedFile(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          File Details: {selectedFile?.original_filename}
        </DialogTitle>
        <DialogContent>
          {selectedFile && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid sx={{ xs: 6 }}>
                  <Typography variant="body2">
                    <strong>Filename:</strong> {selectedFile.original_filename}
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 6 }}>
                  <Typography variant="body2">
                    <strong>Size:</strong> {(selectedFile.file_size / (1024*1024)).toFixed(1)} MB
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 6 }}>
                  <Typography variant="body2">
                    <strong>Type:</strong> {selectedFile.file_type}
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 6 }}>
                  <Typography variant="body2">
                    <strong>Status:</strong> {selectedFile.processing_status}
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 6 }}>
                  <Typography variant="body2">
                    <strong>Condition:</strong> {selectedFile.condition}
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 6 }}>
                  <Typography variant="body2">
                    <strong>Patient:</strong> {selectedFile.user_name || 'Unknown'}
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 12 }}>
                  <Typography variant="body2">
                    <strong>Uploaded:</strong> {new Date(selectedFile.upload_time).toLocaleString()}
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="h6" gutterBottom>
                Signal Channels:
              </Typography>
              
              {signalsLoading ? (
                <Box display="flex" justifyContent="center" py={2}>
                  <CircularProgress />
                </Box>
              ) : signals.length === 0 ? (
                <Typography color="textSecondary">
                  No signals found in this file.
                </Typography>
              ) : (
                <Grid container spacing={2}>
                  {signals.map((signal) => (
                    <Grid sx={{ xs: 12, sm: 6, md: 4 }} key={signal.id}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>
                            {signal.channel_name}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Sampling Rate:</strong> {signal.sampling_rate} Hz
                          </Typography>
                          <Typography variant="body2">
                            <strong>Duration:</strong> {signal.duration} seconds
                          </Typography>
                          <Typography variant="body2">
                            <strong>Data Points:</strong> {signal.data_points}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedFile(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// File Card Component
interface FileCardProps {
  file: SignalFile;
  onView: (file: SignalFile) => void;
  onDelete: (fileId: number) => void;
  getStatusColor: (status: string) => any;
  getConditionColor: (condition: string) => any;
  getConditionIcon: (condition: string) => string;
}

const FileCard: React.FC<FileCardProps> = ({
  file,
  onView,
  onDelete,
  getStatusColor,
  getConditionColor,
  getConditionIcon,
}) => {
  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box flex={1}>
            <Typography variant="h6" noWrap>
              {file.original_filename}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Patient: {file.user_name || 'Unknown'} | Size: {(file.file_size / (1024*1024)).toFixed(1)} MB
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Chip
                label={`${getConditionIcon(file.condition)} ${file.condition.toUpperCase()}`}
                size="small"
                color={getConditionColor(file.condition)}
              />
            </Box>
          </Box>
          <Box>
            <IconButton
              onClick={() => onView(file)}
              color="primary"
              size="small"
            >
              <ViewIcon />
            </IconButton>
            <IconButton
              onClick={() => onDelete(file.id)}
              color="error"
              size="small"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default Files;
