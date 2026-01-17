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
  Grid, // In MUI v6 this is Grid2
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Avatar,
  Paper,
  Fade,
  Stack,
  Divider,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  Download as DownloadIcon,
  Description as FileIcon,
  Event as CalendarIcon,
  Person as PersonIcon,
  LocalHospital as LogoIcon,
  Logout as LogoutIcon,
  CheckCircle as NormalIcon,
  Warning as AbnormalIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { EEGReport } from '../types';

const PatientPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const theme = useTheme();
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
      a.download = `CereSignal_Report_${reportId}.pdf`;
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
  const primaryColor = theme.palette.primary.main;

  return (
    <Box sx={{ 
      flexGrow: 1, 
      bgcolor: '#f4f6f8', 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      
      {/* --- Glassmorphism Header --- */}
      <AppBar 
        position="sticky" 
        elevation={0} 
        sx={{ 
          bgcolor: 'rgba(255, 255, 255, 0.85)', 
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          color: 'text.primary'
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ height: 70 }}>
            {/* Branding */}
            <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 32, mr: 1.5 }} />
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.5px', color: '#1a1a1a' }}>
                Cere<Box component="span" sx={{ color: primaryColor }}>Signal</Box>
              </Typography>
            </Box>

            {/* Profile & Actions */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                avatar={<Avatar sx={{ bgcolor: theme.palette.secondary.main }}>{patientName[0].toUpperCase()}</Avatar>}
                label={patientName}
                sx={{ 
                  bgcolor: 'transparent', 
                  border: '1px solid', 
                  borderColor: 'divider',
                  fontWeight: 500
                }}
              />
              <Button 
                variant="outlined" 
                color="error" 
                size="small" 
                startIcon={<LogoutIcon />} 
                onClick={logout}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                Logout
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* --- Main Content --- */}
      <Container maxWidth="lg" sx={{ mt: 5, mb: 5, flexGrow: 1 }}>
        <Fade in={true} timeout={800}>
          <Box>
            {/* Page Title */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 1 }}>
                  Medical Reports
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  View and download your latest EEG analysis and clinical findings.
                </Typography>
              </Box>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>
                <CircularProgress size={50} />
              </Box>
            ) : reports.length === 0 ? (
              // --- Empty State ---
              <Paper 
                elevation={0}
                sx={{ 
                  p: 6, 
                  textAlign: 'center', 
                  borderRadius: 4, 
                  bgcolor: '#fff', 
                  border: '1px dashed',
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ bgcolor: 'action.hover', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3 }}>
                   <FileIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
                </Box>
                <Typography variant="h6" gutterBottom>No Reports Available</Typography>
                <Typography variant="body2" color="text.secondary">
                  Your doctor has not published any EEG reports for you yet. 
                  <br />Please check back later or contact your clinic.
                </Typography>
              </Paper>
            ) : (
              // --- Reports Grid ---
              <Grid container spacing={3}>
                {reports.map((report) => {
                  const isNormal = report.impression?.toLowerCase().includes('normal');
                  
                  return (
                    // FIX: Replaced 'item xs={12}' with 'size={{ xs: 12 }}'
                    <Grid size={{ xs: 12 }} key={report.id}>
                      <Card 
                        elevation={0}
                        sx={{ 
                          borderRadius: 3,
                          border: '1px solid',
                          borderColor: 'divider',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            borderColor: primaryColor,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.05)'
                          }
                        }}
                      >
                        <CardContent sx={{ p: 3 }}>
                          <Grid container spacing={2} alignItems="center">
                            
                            {/* Icon Column */}
                            {/* FIX: Replaced 'item xs={...}' with 'size={{ xs: ... }}' */}
                            <Grid size={{ xs: 12, sm: 1 }} sx={{ display: 'flex', justifyContent: 'center' }}>
                              <Avatar sx={{ bgcolor: isNormal ? 'success.light' : 'warning.light', color: isNormal ? 'success.dark' : 'warning.dark', width: 56, height: 56 }}>
                                <FileIcon fontSize="large" />
                              </Avatar>
                            </Grid>

                            {/* Main Info Column */}
                            {/* FIX: Replaced 'item xs={...}' with 'size={{ xs: ... }}' */}
                            <Grid size={{ xs: 12, sm: 8 }}>
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, display: 'inline', mr: 2 }}>
                                  {report.file_name || `EEG Analysis Report #${report.id}`}
                                </Typography>
                                {report.impression && (
                                  <Chip 
                                    icon={isNormal ? <NormalIcon /> : <AbnormalIcon />}
                                    label={report.impression.toUpperCase()} 
                                    size="small"
                                    color={isNormal ? "success" : "warning"}
                                    variant="outlined"
                                    sx={{ fontWeight: 700 }}
                                  />
                                )}
                              </Box>
                              
                              <Stack direction="row" spacing={3} sx={{ mb: 1.5, color: 'text.secondary', fontSize: '0.875rem' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <CalendarIcon fontSize="small" sx={{ mr: 0.5 }} />
                                  {new Date(report.report_date).toLocaleDateString()}
                                </Box>
                                {report.doctor_name && (
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <PersonIcon fontSize="small" sx={{ mr: 0.5 }} />
                                    Dr. {report.doctor_name}
                                  </Box>
                                )}
                              </Stack>

                              {report.factual_report && (
                                <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                  {report.factual_report}
                                </Typography>
                              )}
                            </Grid>

                            {/* Action Column */}
                            {/* FIX: Replaced 'item xs={...}' with 'size={{ xs: ... }}' */}
                            <Grid size={{ xs: 12, sm: 3 }} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                              {report.pdf_file_path && (
                                <Button
                                  variant="contained"
                                  startIcon={<DownloadIcon />}
                                  onClick={() => handleDownloadPDF(report.id)}
                                  sx={{ 
                                    borderRadius: 2, 
                                    textTransform: 'none', 
                                    fontWeight: 600,
                                    px: 3
                                  }}
                                >
                                  Download PDF
                                </Button>
                              )}
                            </Grid>

                          </Grid>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Box>
        </Fade>
      </Container>
    </Box>
  );
};

export default PatientPortal;