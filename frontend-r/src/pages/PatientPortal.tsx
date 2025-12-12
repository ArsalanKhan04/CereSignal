import React, { useState, useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { EEGReport } from '../types';

const PatientPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState<EEGReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const response = await apiClient.getReports();
      if (response.status === 200) {
        setReports(response.data);
      } else {
        setError('Failed to load reports');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading reports';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (reportId: number) => {
    try {
      const blob = await apiClient.downloadReportPDF(reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EEG_Report_${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to download PDF:', err);
      alert('Failed to download PDF. Please try again.');
    }
  };

  const patientName = user?.username || 'Patient';

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Patient Portal
          </Typography>
          <Typography variant="body1" sx={{ mr: 2 }}>
            Welcome, {patientName}!
          </Typography>
          <Button color="inherit" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 4, fontWeight: 600 }}>
          My Medical Reports
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent>
              <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
                No reports available at this time.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {reports.map((report) => (
              <Grid sx={{ xs: 12 }} key={report.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                          {report.file_name || `EEG Report #${report.id}`}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Report Date: {new Date(report.report_date).toLocaleDateString()}
                        </Typography>
                        {report.patient_name && (
                          <Typography variant="body2" color="text.secondary">
                            Patient: {report.patient_name}
                          </Typography>
                        )}
                        {report.doctor_name && (
                          <Typography variant="body2" color="text.secondary">
                            Doctor: {report.doctor_name}
                          </Typography>
                        )}
                      </Box>
                      <Box>
                        {report.pdf_file_path && (
                          <IconButton
                            color="primary"
                            onClick={() => handleDownloadPDF(report.id)}
                            title="Download PDF"
                          >
                            <DownloadIcon />
                          </IconButton>
                        )}
                      </Box>
                    </Box>

                    {report.impression && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          Impression:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: report.impression === 'normal' ? 'success.main' : 'error.main',
                            fontWeight: 500,
                          }}
                        >
                          {report.impression.charAt(0).toUpperCase() + report.impression.slice(1)}
                        </Typography>
                      </Box>
                    )}

                    {report.factual_report && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          Report Summary:
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {report.factual_report}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </Box>
  );
};

export default PatientPortal;
