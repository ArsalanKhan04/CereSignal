import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Description as ReportIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { SignalFile, Signal, EEGReport, Patient } from '../types';
import ReportForm from './ReportForm';

interface FileListProps {
  patientId: number;
}

const FileList: React.FC<FileListProps> = ({ patientId }) => {
  const [files, setFiles] = useState<SignalFile[]>([]);
  const [patient, setPatient] = useState<Patient | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<SignalFile | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportFile, setReportFile] = useState<SignalFile | null>(null);
  const [polling, setPolling] = useState(false);
  const [reportPolling, setReportPolling] = useState(false);
  const [viewReportDialog, setViewReportDialog] = useState(false);
  const [viewingReport, setViewingReport] = useState<SignalFile | null>(null);

  useEffect(() => {
    loadFiles();
  }, [patientId]);

  // Poll for inference status updates on files that are processing
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

  // Poll for report generation status on files with report_task_id but no report yet
  useEffect(() => {
    const reportPendingFiles = files.filter(file =>
      file.report_task_id &&
      !file.factual_report &&
      file.condition !== 'processing'
    );

    if (reportPendingFiles.length === 0) {
      setReportPolling(false);
      return;
    }

    setReportPolling(true);
    const pollInterval = setInterval(async () => {
      for (const file of reportPendingFiles) {
        try {
          const response = await apiClient.checkReportStatus(file.id);
          if (response.status === 200 && response.data) {
            const reportData = response.data;

            // If report is completed, update the file with report data
            if (reportData.has_report && reportData.report) {
              setFiles(prevFiles =>
                prevFiles.map(f =>
                  f.id === file.id
                    ? {
                        ...f,
                        factual_report: reportData.report.factual_report,
                        impression: reportData.report.impression
                      }
                    : f
                )
              );
            }
          }
        } catch (err) {
          console.error('Error checking report status:', err);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(pollInterval);
      setReportPolling(false);
    };
  }, [files]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const [filesResponse, patientResponse] = await Promise.all([
        apiClient.getFiles(patientId),
        apiClient.getPatient(patientId)
      ]);

      if (filesResponse.status === 200) {
        setFiles(filesResponse.data);
      } else {
        setError('Failed to load files');
      }

      if (patientResponse.status === 200) {
        setPatient(patientResponse.data);
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

  const handleCreateReport = (file: SignalFile) => {
    setReportFile(file);
    setShowReportForm(true);
  };

  const handleReportSaved = (report: EEGReport) => {
    setShowReportForm(false);
    setReportFile(null);
  };

  const handleViewReport = (file: SignalFile) => {
    setViewingReport(file);
    setViewReportDialog(true);
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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (files.length === 0) {
    return (
      <Box>
        {polling && (
          <Box display="flex" justifyContent="center" mb={2}>
            <Chip
              icon={<CircularProgress size={16} />}
              label="Processing files..."
              color="info"
              variant="outlined"
            />
          </Box>
        )}
        <Typography color="textSecondary" align="center" sx={{ py: 2 }}>
          No files uploaded yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {polling && (
        <Box display="flex" justifyContent="center" mb={2}>
          <Chip
            icon={<CircularProgress size={16} />}
            label="Analyzing EEG data..."
            color="info"
            variant="outlined"
          />
        </Box>
      )}
      {reportPolling && (
        <Box display="flex" justifyContent="center" mb={2}>
          <Chip
            icon={<CircularProgress size={16} />}
            label="Generating clinical report..."
            color="secondary"
            variant="outlined"
          />
        </Box>
      )}
      {files.map((file) => (
        <Card key={file.id} sx={{ mb: 2 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box flex={1}>
                <Typography variant="h6">{file.original_filename}</Typography>
                <Typography variant="body2" color="textSecondary">
                  Size: {(file.file_size / (1024*1024)).toFixed(1)} MB | Type: {file.file_type}
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${getConditionIcon(file.condition)} ${file.condition.toUpperCase()}`}
                    size="small"
                    color={getConditionColor(file.condition)}
                  />
                  {file.report_task_id && !file.factual_report && file.condition !== 'processing' && (
                    <Chip
                      icon={<CircularProgress size={12} />}
                      label="Report generating..."
                      size="small"
                      color="secondary"
                      variant="outlined"
                    />
                  )}
                  {file.factual_report && (
                    <Chip
                      label="✅ Report Ready"
                      size="small"
                      color="success"
                      variant="outlined"
                      onClick={() => handleViewReport(file)}
                      sx={{ cursor: 'pointer' }}
                    />
                  )}
                </Box>
              </Box>
              <Box>
                <IconButton
                  onClick={() => handleViewFile(file)}
                  color="primary"
                  title="View EEG"
                >
                  <ViewIcon />
                </IconButton>
                <IconButton
                  onClick={() => handleCreateReport(file)}
                  color="secondary"
                  title="Create Report"
                >
                  <ReportIcon />
                </IconButton>
                <IconButton
                  onClick={() => handleDeleteFile(file.id)}
                  color="error"
                  title="Delete File"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}

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
                    <strong>Condition:</strong> {selectedFile.condition}
                  </Typography>
                </Grid>
                <Grid sx={{ xs: 6 }}>
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

      {/* Report Form Dialog */}
      {showReportForm && reportFile && (
        <ReportForm
          fileId={reportFile.id}
          signalFile={reportFile}
          patient={patient}
          onSave={handleReportSaved}
          onCancel={() => {
            setShowReportForm(false);
            setReportFile(null);
          }}
          isDialog={true}
        />
      )}

      {/* View Generated Report Dialog */}
      <Dialog
        open={viewReportDialog}
        onClose={() => {
          setViewReportDialog(false);
          setViewingReport(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          AI-Generated EEG Report
          {viewingReport && (
            <Typography variant="caption" display="block" color="textSecondary">
              File: {viewingReport.original_filename}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {viewingReport && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                FACTUAL REPORT
              </Typography>
              <Typography
                variant="body1"
                paragraph
                sx={{
                  whiteSpace: 'pre-wrap',
                  backgroundColor: '#f5f5f5',
                  padding: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.95rem'
                }}
              >
                {viewingReport.factual_report || 'No factual report available.'}
              </Typography>

              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                IMPRESSION
              </Typography>
              <Typography
                variant="body1"
                paragraph
                sx={{
                  whiteSpace: 'pre-wrap',
                  backgroundColor: '#f5f5f5',
                  padding: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.95rem'
                }}
              >
                {viewingReport.impression || 'No impression available.'}
              </Typography>

              <Alert severity="info" sx={{ mt: 2 }}>
                This report was automatically generated by AI. It should be reviewed and edited by a qualified physician before being finalized.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setViewReportDialog(false);
            setViewingReport(null);
          }}>
            Close
          </Button>
          {viewingReport && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => {
                setViewReportDialog(false);
                handleCreateReport(viewingReport);
              }}
            >
              Edit in Report Form
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileList;
