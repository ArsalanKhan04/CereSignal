import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid, // In MUI v6 use Grid2 syntax
  Chip,
  IconButton,
  Dialog,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Fade,
  Paper,
  Tooltip,
  Divider,
  Stack,
  useTheme
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ReportIcon from '@mui/icons-material/Description';
import PDFIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';
import TimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import FileIcon from '@mui/icons-material/InsertDriveFile';
import FinalizedIcon from '@mui/icons-material/CheckCircle';
import DraftIcon from '@mui/icons-material/Drafts';
import HistoryIcon from '@mui/icons-material/History';
import { apiClient } from '../services/api';
import { pdfNameFromEdf } from '../utils/fileNames';
import { EEGReport, SignalFile } from '../types';
import ReportForm from '../components/ReportForm';
import ReportVersionHistory from '../components/ReportVersionHistory';

// Ensure this file is treated as a module
export {};

const ReportsPage: React.FC = () => {
  const theme = useTheme();
  
  // State
  const [reports, setReports] = useState<EEGReport[]>([]);
  const [signalFiles, setSignalFiles] = useState<SignalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  
  // UI State
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [editingReport, setEditingReport] = useState<EEGReport | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState<Set<number>>(new Set());
  const [historyReport, setHistoryReport] = useState<EEGReport | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reportsResponse, filesResponse] = await Promise.all([
        apiClient.getReports(),
        apiClient.getFiles()
      ]);

      if (reportsResponse.status === 200) setReports(reportsResponse.data);
      if (filesResponse.status === 200) setSignalFiles(filesResponse.data);
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
    setSelectedFileId(report.file_id);
    setEditingReport(report);
    setShowReportForm(true);
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!window.confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiClient.deleteReport(reportId);
      if (response.status === 200) {
        setReports(reports.filter(report => report.id !== reportId));
        setSuccess('Report deleted successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error deleting report';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  const handleReportSaved = () => {
    setShowReportForm(false);
    setSelectedFileId(null);
    setEditingReport(null);
    loadData();
    setSuccess(editingReport ? 'Report updated successfully' : 'Report created successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleOpenHistory = (report: EEGReport) => {
    setHistoryReport(report);
  };

  const handleHistoryClose = () => {
    setHistoryReport(null);
  };

  const handleVersionRestored = () => {
    loadData();
    setSuccess('Report restored to selected version.');
    setTimeout(() => setSuccess(''), 4000);
  };

  const handleGeneratePDF = async (reportId: number) => {
    try {
      setPdfGenerating(prev => new Set(prev).add(reportId));
      const response = await apiClient.generateReportPDF(reportId);
      if (response.status === 200) {
        setSuccess('PDF generated successfully!');
        await loadData();
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError('Error generating PDF');
    } finally {
      setPdfGenerating(prev => {
        const newSet = new Set(prev);
        newSet.delete(reportId);
        return newSet;
      });
    }
  };

  const handleDownloadPDF = async (reportId: number, fileName?: string) => {
    try {
      const blob = await apiClient.downloadReportPDF(reportId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfNameFromEdf(fileName, `EEG_Report_${reportId}`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err: any) {
      setError('Error downloading PDF');
    }
  };

  const getImpressionColor = (impression: string | undefined) => {
    if (!impression) return 'default';
    if (impression.toLowerCase().includes('normal')) return 'success';
    if (impression.toLowerCase().includes('abnormal')) return 'error';
    return 'warning';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={40} thickness={4} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 0 }}>
      
      {/* --- Page Header --- */}
      <Box 
        display="flex" 
        justifyContent="space-between" 
        alignItems="center" 
        mb={4}
        sx={{ 
          borderBottom: '1px solid', 
          borderColor: 'divider', 
          pb: 2 
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight="700" sx={{ color: '#1a1a1a' }}>
            Clinical Reports
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage, generate, and analyze EEG findings.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => setShowReportForm(true)}
          sx={{ 
            borderRadius: 2, 
            textTransform: 'none', 
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.2)' 
          }}
        >
          New Report
        </Button>
      </Box>

      {/* --- Alerts --- */}
      <Box sx={{ mb: 3 }}>
        <Fade in={!!error}>
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, display: error ? 'flex' : 'none' }}>
            {error}
          </Alert>
        </Fade>
        <Fade in={!!success}>
          <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2, display: success ? 'flex' : 'none' }}>
            {success}
          </Alert>
        </Fade>
      </Box>

      {/* --- File Selection Card (Creation Mode) --- */}
      <Fade in={showReportForm && !editingReport}>
        <Box sx={{ mb: 4, display: showReportForm && !editingReport ? 'block' : 'none' }}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 4, 
              border: '1px solid', 
              borderColor: 'primary.main', 
              bgcolor: 'primary.50',
              borderRadius: 3 
            }}
          >
            <Typography variant="h6" fontWeight="600" color="primary.main" gutterBottom>
              Start New Analysis
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Select a raw EEG recording to begin the reporting process.
            </Typography>
            
            <Grid container spacing={2} alignItems="center">
              {/* FIX: Replaced 'item xs' with 'size' */}
              <Grid size={{ xs: 12, md: 8 }}>
                <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                  <InputLabel>Select EEG Recording</InputLabel>
                  <Select
                    value={selectedFileId || ''}
                    onChange={(e) => setSelectedFileId(Number(e.target.value))}
                    label="Select EEG Recording"
                  >
                    {signalFiles.map((file) => (
                      <MenuItem key={file.id} value={file.id}>
                        {file.original_filename} — {file.user_name || 'Unknown Patient'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {/* FIX: Replaced 'item xs' with 'size' */}
              <Grid size={{ xs: 12, md: 4 }} display="flex" gap={2}>
                <Button
                  variant="contained"
                  onClick={() => selectedFileId && handleCreateReport(selectedFileId)}
                  disabled={!selectedFileId}
                  fullWidth
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Create Report
                </Button>
                <Button 
                  onClick={() => { setShowReportForm(false); setSelectedFileId(null); }}
                  fullWidth
                  variant="outlined"
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Cancel
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Box>
      </Fade>

      {/* --- Reports Grid --- */}
      {reports.length === 0 ? (
        <Paper 
          elevation={0} 
          sx={{ 
            p: 8, 
            textAlign: 'center', 
            borderRadius: 3, 
            border: '1px dashed', 
            borderColor: 'divider',
            bgcolor: 'background.paper' 
          }}
        >
          <ReportIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" color="text.primary" gutterBottom>No Reports Found</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            You haven't created any analysis reports yet.
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setShowReportForm(true)}>
            Create First Report
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {reports.map((report) => (
            // FIX: Replaced 'item xs' with 'size'
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={report.id}>
              <Card 
                elevation={0}
                sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 3 }}>
                  
                  <Box display="flex" justifyContent="flex-end" mb={2}>
                    <Stack direction="row" spacing={1}>
                      <Chip 
                        label={report.impression || "Pending Analysis"} 
                        size="small" 
                        color={getImpressionColor(report.impression)}
                        sx={{ fontWeight: 600 }}
                      />
                      {report.pdf_file_path && (
                        <Tooltip title="PDF Available">
                          <Chip icon={<PDFIcon />} label="PDF" size="small" color="primary" variant="outlined" clickable onClick={() => handleDownloadPDF(report.id, report.file_name)} />
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>

                  {/* Main Info */}
                  <Typography variant="h6" fontWeight="700" noWrap title={report.patient_name || 'Unknown Patient'}>
                    {report.patient_name || 'Unknown Patient'}
                  </Typography>
                  
                  <Stack direction="row" spacing={2} sx={{ mt: 1, mb: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
                    <Box display="flex" alignItems="center">
                      <FileIcon fontSize="inherit" sx={{ mr: 0.5 }} />
                      <Typography variant="caption" noWrap sx={{ maxWidth: 120 }}>{report.file_name}</Typography>
                    </Box>
                    <Box display="flex" alignItems="center">
                      <TimeIcon fontSize="inherit" sx={{ mr: 0.5 }} />
                      <Typography variant="caption">{new Date(report.report_date).toLocaleDateString()}</Typography>
                    </Box>
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  {/* Summary Snippet */}
                  <Typography variant="body2" color="text.secondary" sx={{ 
                    mb: 2, 
                    minHeight: 40,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {report.factual_report || "No summary available."}
                  </Typography>

                  {/* Actions */}
                  <Box display="flex" justifyContent="flex-end" gap={1} mt="auto">
                    <Tooltip title="Edit Report">
                      <IconButton 
                        size="small" 
                        onClick={() => handleEditReport(report)}
                        sx={{ bgcolor: 'action.hover', color: 'primary.main' }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Version History">
                      <IconButton
                        size="small"
                        onClick={() => handleOpenHistory(report)}
                        sx={{ bgcolor: 'action.hover', color: 'info.main' }}
                      >
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title={report.pdf_file_path ? "Regenerate PDF" : "Generate PDF"}>
                      <span>
                        <IconButton 
                          size="small" 
                          onClick={() => handleGeneratePDF(report.id)}
                          disabled={pdfGenerating.has(report.id)}
                          sx={{ bgcolor: 'action.hover', color: 'secondary.main' }}
                        >
                          {pdfGenerating.has(report.id) ? <CircularProgress size={18} /> : <PDFIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>

                    <Tooltip title="Download PDF">
                      <IconButton 
                        size="small" 
                        onClick={() => handleDownloadPDF(report.id, report.file_name)}
                        sx={{ bgcolor: 'action.hover', color: 'success.main' }}
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Delete Report">
                      <IconButton 
                        size="small" 
                        onClick={() => handleDeleteReport(report.id)}
                        sx={{ bgcolor: 'error.lighter', color: 'error.main', '&:hover': { bgcolor: 'error.light', color: 'white' } }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>

                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* --- Report Form Dialog --- */}
      {showReportForm && (selectedFileId || editingReport) && (
        <ReportForm
          fileId={selectedFileId || editingReport?.file_id}
          signalFile={signalFiles.find(f => f.id === (selectedFileId || editingReport?.file_id))}
          patient={undefined}
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

      {/* --- Version History Dialog --- */}
      {historyReport && (
        <ReportVersionHistory
          reportId={historyReport.id}
          reportPatientName={historyReport.patient_name}
          open={Boolean(historyReport)}
          onClose={handleHistoryClose}
          onRestored={handleVersionRestored}
        />
      )}
    </Box>
  );
};

export default ReportsPage;
