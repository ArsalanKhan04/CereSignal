import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Dialog,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Description as ReportIcon,
  PictureAsPdf as PDFIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EEGReport, SignalFile, User, Patient } from '../types';
import ReportForm from '../components/ReportForm';

const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<EEGReport[]>([]);
  const [signalFiles, setSignalFiles] = useState<SignalFile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [editingReport, setEditingReport] = useState<EEGReport | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reportsResponse, filesResponse, patientsResponse] = await Promise.all([
        apiClient.getReports(),
        apiClient.getFiles(),
        apiClient.getPatients()
      ]);

      if (reportsResponse.status === 200) {
        console.log('Loaded reports:', reportsResponse.data);
        setReports(reportsResponse.data);
      }
      if (filesResponse.status === 200) {
        setSignalFiles(filesResponse.data);
      }
      if (patientsResponse.status === 200) {
        setPatients(patientsResponse.data);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading data';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = (fileId: number) => {
    setSelectedFileId(fileId);
    setEditingReport(null);
    setShowReportForm(true);
  };

  const handleEditReport = (report: EEGReport) => {
    console.log('handleEditReport called with report:', report);
    setSelectedFileId(report.file_id);
    setEditingReport(report);
    setShowReportForm(true);
    console.log('State set - selectedFileId:', report.file_id, 'editingReport:', report, 'showReportForm: true');
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!window.confirm('Are you sure you want to delete this report?')) {
      return;
    }

    try {
      const response = await apiClient.deleteReport(reportId);
      if (response.status === 200) {
        setReports(reports.filter(report => report.id !== reportId));
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error deleting report';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  const handleReportSaved = (report: EEGReport) => {
    setShowReportForm(false);
    setSelectedFileId(null);
    setEditingReport(null);
    loadData(); // Reload reports
  };

  const handleGeneratePDF = async (reportId: number) => {
    try {
      setPdfGenerating(prev => new Set(prev).add(reportId));
      console.log('Generating PDF for report:', reportId);
      const response = await apiClient.generateReportPDF(reportId);
      console.log('PDF generation response:', response);
      if (response.status === 200) {
        setSuccess('PDF generated successfully!');
        console.log('Reloading data after PDF generation...');
        await loadData(); // Reload to update PDF status
        console.log('Data reloaded, reports:', reports);
      }
    } catch (err: any) {
      console.error('PDF generation error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Error generating PDF';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setPdfGenerating(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }
  };

  const handleDownloadPDF = async (reportId: number) => {
    try {
      const blob = await apiClient.downloadReportPDF(reportId);
      
      // Create blob URL
      const url = window.URL.createObjectURL(blob);
      
      // Create temporary link element
      const link = document.createElement('a');
      link.href = url;
      link.download = `EEG_Report_${reportId}.pdf`;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      setSuccess('PDF downloaded successfully!');
    } catch (err: any) {
      console.error('Download error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Error downloading PDF';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  const getImpressionColor = (impression: string) => {
    return impression === 'normal' ? 'success' : 'error';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">EEG Reports</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowReportForm(true)}
        >
          Create Report
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* File Selection for New Report */}
      {showReportForm && !editingReport && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Select EEG File for Report
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Select File</InputLabel>
              <Select
                value={selectedFileId || ''}
                onChange={(e) => setSelectedFileId(Number(e.target.value))}
                label="Select File"
              >
                {signalFiles.map((file) => (
                  <MenuItem key={file.id} value={file.id}>
                    {file.original_filename} - {file.user_name || 'Unknown Patient'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box display="flex" gap={2} mt={2}>
              <Button
                variant="contained"
                onClick={() => selectedFileId && handleCreateReport(selectedFileId)}
                disabled={!selectedFileId}
              >
                Create Report
              </Button>
              <Button onClick={() => setShowReportForm(false)}>
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Reports List */}
      <Grid container spacing={3}>
        {reports.map((report) => {
          console.log('Rendering report:', report.id, 'PDF path:', report.pdf_file_path);
          return (
          <Grid sx={{ xs: 12, md: 6 }} key={report.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Box>
                    <Typography variant="h6">{report.patient_name}</Typography>
                    <Typography color="textSecondary" variant="body2">
                      {report.file_name}
                    </Typography>
                    <Typography color="textSecondary" variant="body2">
                      {new Date(report.report_date).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1}>
                    {report.pdf_file_path && (
                      <Chip
                        label="PDF"
                        color="success"
                        size="small"
                        icon={<PDFIcon />}
                      />
                    )}
                    <Chip
                      label={report.impression}
                      color={getImpressionColor(report.impression)}
                      size="small"
                    />
                    {report.is_finalized && (
                      <Chip label="Finalized" color="success" size="small" />
                    )}
                    {/* Debug info */}
                    {process.env.NODE_ENV === 'development' && (
                      <Chip
                        label={`PDF: ${report.pdf_file_path ? 'Yes' : 'No'}`}
                        color="info"
                        size="small"
                      />
                    )}
                  </Box>
                </Box>

                {report.factual_report && (
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {report.factual_report.substring(0, 150)}
                    {report.factual_report.length > 150 && '...'}
                  </Typography>
                )}

                <Box display="flex" justifyContent="flex-end" gap={1}>
                  <IconButton
                    size="small"
                    onClick={() => handleEditReport(report)}
                    color="primary"
                    title="Edit Report"
                  >
                    <EditIcon />
                  </IconButton>
                  {!report.pdf_file_path ? (
                    <IconButton
                      size="small"
                      onClick={() => handleGeneratePDF(report.id)}
                      color="secondary"
                      title="Generate PDF"
                      disabled={pdfGenerating.has(report.id)}
                    >
                      {pdfGenerating.has(report.id) ? <CircularProgress size={16} /> : <PDFIcon />}
                    </IconButton>
                  ) : (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => handleDownloadPDF(report.id)}
                        color="success"
                        title="Download PDF"
                      >
                        <DownloadIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => {
                          const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
                          window.open(`${apiUrl}/api/v1/reports/${report.id}/download-pdf`, '_blank');
                        }}
                        color="info"
                        title="Open PDF in new tab"
                      >
                        <PDFIcon />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteReport(report.id)}
                    color="error"
                    title="Delete Report"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          );
        })}
      </Grid>

      {reports.length === 0 && (
        <Card>
          <CardContent>
            <Box textAlign="center" py={4}>
              <ReportIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                No reports found
              </Typography>
              <Typography color="text.secondary">
                Create your first EEG report to get started
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Report Form Dialog */}
      {showReportForm && (selectedFileId || editingReport) && (
        <ReportForm
          fileId={selectedFileId || editingReport?.file_id}
          signalFile={signalFiles.find(f => f.id === (selectedFileId || editingReport?.file_id))}
          patient={patients.find(p => p.id === signalFiles.find(f => f.id === (selectedFileId || editingReport?.file_id))?.user_id) || undefined}
          existingReport={editingReport}
          onSave={handleReportSaved}
          onCancel={() => {
            setShowReportForm(false);
            setSelectedFileId(null);
            setEditingReport(null);
          }}
          isDialog={true}
        />
      )}
      {/* Debug info */}
      {showReportForm && (
        <div style={{ position: 'fixed', top: 0, right: 0, background: 'yellow', padding: '10px', zIndex: 9999 }}>
          <div>selectedFileId: {selectedFileId}</div>
          <div>editingReport: {editingReport ? 'exists' : 'null'}</div>
          <div>editingReport?.file_id: {editingReport?.file_id}</div>
          <div>fileId: {selectedFileId || editingReport?.file_id}</div>
        </div>
      )}
    </Box>
  );
};

export default ReportsPage;