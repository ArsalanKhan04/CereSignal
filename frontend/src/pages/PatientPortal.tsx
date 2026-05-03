import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useDemo } from '../contexts/DemoContext';
import { apiClient } from '../services/api';
import { pdfNameFromEdf } from '../utils/fileNames';
import { EEGReport, Patient, EEGBookmark } from '../types';

const PatientPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const { isActive: isDemoActive, currentStepId, jumpToStep, endDemo } = useDemo();
  const [reports, setReports] = useState<EEGReport[]>([]);
  const [patientProfile, setPatientProfile] = useState<Patient | null>(null);
  const [bookmarks, setBookmarks] = useState<EEGBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadReports();
    loadPatientProfile();
    if (isDemoActive && currentStepId === '6.0') {
      jumpToStep('6.1');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reports.length === 0) {
      setBookmarks([]);
      return;
    }

    const latestFileId = reports[0]?.file_id;
    if (!latestFileId) {
      setBookmarks([]);
      return;
    }

    const loadBookmarks = async () => {
      try {
        const response = await apiClient.getBookmarks(latestFileId);
        if (response.status === 200) {
          setBookmarks(response.data);
        }
      } catch (err) {
        console.error('Failed to load bookmarks:', err);
      }
    };

    loadBookmarks();
  }, [reports]);

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

  const loadPatientProfile = async () => {
    try {
      const response = await apiClient.getPatients();
      if (response.status === 200) {
        setPatientProfile(response.data[0] || null);
      } else {
        setError('Failed to load patient profile');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading patient profile';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  const handleDownloadPDF = async (reportId: number, fileName?: string) => {
    try {
      const blob = await apiClient.downloadReportPDF(reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfNameFromEdf(fileName, `CereSignal_Report_${reportId}`);
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
  const sortedReports = [...reports].sort(
    (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
  );
  const latestReport = sortedReports[0];
  const hasReports = reports.length > 0;
  const portalStatusLabel = hasReports ? 'Reviewed' : 'To be reviewed';
  const portalStatusColor = hasReports ? 'success' : 'warning';

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
          <Toolbar disableGutters sx={{ height: 56 }}>
            {/* Branding */}
            <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 26, mr: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.4px', color: '#1a1a1a' }}>
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
                  fontWeight: 500,
                  height: 36
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
      <Container maxWidth="lg" sx={{ mt: 3, mb: 3, flexGrow: 1 }}>
        <Fade in={true} timeout={800}>
            <Box>
              {/* Page Title */}
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 0.5 }}>
                    Medical Reports
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    View and download your latest EEG analysis and clinical findings.
                  </Typography>
                </Box>
                <Chip
                  label={portalStatusLabel}
                  color={portalStatusColor as any}
                  variant={hasReports ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700, height: 32 }}
                />
              </Box>

              <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', mb: 3 }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Patient Profile
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Personal details and clinical basics.
                      </Typography>
                    </Box>
                    {patientProfile?.medical_id && (
                      <Chip label={`Medical ID ${patientProfile.medical_id}`} variant="outlined" />
                    )}
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Name</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.name || patientName}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Age</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.age ?? '—'}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Gender</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.gender || '—'}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Blood Group</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.blood_type || '—'}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Phone</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.phone || '—'}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Email</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.email || '—'}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Assigned Doctor</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.doctor_name || '—'}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                      <Typography variant="caption" color="text.secondary">Member Since</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>{patientProfile?.created_at ? new Date(patientProfile.created_at).toLocaleDateString() : '—'}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                  <CircularProgress size={50} />
                </Box>
              ) : !hasReports ? (
                // --- Empty State ---
                  <Paper 
                    elevation={0}
                    sx={{ 
                      p: 5, 
                      textAlign: 'center', 
                      borderRadius: 3, 
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
                <Stack spacing={3}>
                  <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                              Latest Report
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {latestReport?.file_name || `EEG Analysis Report #${latestReport?.id}`}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Chip
                              label={latestReport?.impression === 'normal' ? 'Normal' : 'Abnormal'}
                              color={latestReport?.impression === 'normal' ? 'success' : 'warning'}
                              icon={latestReport?.impression === 'normal' ? <NormalIcon /> : <AbnormalIcon />}
                              variant="outlined"
                              sx={{ fontWeight: 700 }}
                            />
                            <Chip
                              label={new Date(latestReport?.report_date || '').toLocaleDateString()}
                              size="small"
                              variant="outlined"
                              icon={<CalendarIcon />}
                            />
                            {latestReport?.doctor_name && (
                              <Chip
                                label={`Dr. ${latestReport.doctor_name}`}
                                size="small"
                                variant="outlined"
                                icon={<PersonIcon />}
                              />
                            )}
                          </Stack>
                        </Box>
                        <Divider />
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Typography variant="caption" color="text.secondary">Indications</Typography>
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {latestReport?.indications || 'Not provided'}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Typography variant="caption" color="text.secondary">Technique</Typography>
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {latestReport?.technique || 'Not provided'}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Typography variant="caption" color="text.secondary">Factual Report</Typography>
                            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                              {latestReport?.factual_report || 'Not provided'}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Typography variant="caption" color="text.secondary">Impression</Typography>
                            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                              {latestReport?.impression ? latestReport.impression.toUpperCase() : 'Not provided'}
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Typography variant="caption" color="text.secondary">Doctor Notes</Typography>
                            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                              {latestReport?.doctor_info || 'Not provided'}
                            </Typography>
                          </Grid>
                        </Grid>
                        <Button
                          variant="contained"
                          startIcon={<DownloadIcon />}
                            onClick={() => handleDownloadPDF(latestReport.id, latestReport.file_name)}
                          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
                        >
                          Download PDF
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  {bookmarks.length > 0 && (
                    <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                      <CardContent sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                          EEG Bookmarks
                        </Typography>
                        <Stack spacing={2}>
                          {bookmarks.map((bookmark) => (
                            <Box key={bookmark.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                              <Box
                                component="img"
                                src={`${apiClient.getPublicBaseUrl()}${bookmark.image_url}`}
                                alt="EEG bookmark"
                                sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                              />
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                {bookmark.comment || 'No comment provided.'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {new Date(bookmark.created_at).toLocaleString()}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  )}

                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
                      Previous Reports
                    </Typography>
                    <Grid container spacing={3}>
                      {sortedReports.map((report) => {
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
                                    <Button
                                      variant="contained"
                                      startIcon={<DownloadIcon />}
                                      onClick={() => handleDownloadPDF(report.id, report.file_name)}
                                      sx={{ 
                                        borderRadius: 2, 
                                        textTransform: 'none', 
                                        fontWeight: 600,
                                        px: 3
                                      }}
                                    >
                                      Download PDF
                                    </Button>
                                  </Grid>

                                </Grid>
                              </CardContent>
                            </Card>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </Box>
                </Stack>
              )}
            </Box>

        </Fade>

        {/* Demo Completion Overlay */}
        {isDemoActive && currentStepId === '6.2' && (
          <Box
            sx={{
              mt: 4,
              mx: 'auto',
              maxWidth: 600,
              p: 4,
              borderRadius: 3,
              bgcolor: '#fffbeb',
              border: '2px solid #f59e0b',
              textAlign: 'center',
            }}
          >
            <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>
              🎉 Demo Complete!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              You've seen the full CereSignal workflow in under 3 minutes.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap', mb: 3 }}>
              {[
                '1 Hospital created',
                '3 Staff registered',
                '3 Patients managed',
                '2 Reports generated',
                '1 Portal email sent',
              ].map((stat) => (
                <Box
                  key={stat}
                  sx={{
                    px: 2,
                    py: 0.5,
                    borderRadius: 10,
                    bgcolor: 'white',
                    border: '1px solid #f59e0b',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#92400e',
                  }}
                >
                  {stat}
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={() => {
                  endDemo();
                  logout();
                  navigate('/');
                }}
                sx={{ borderColor: '#f59e0b', color: '#92400e', '&:hover': { borderColor: '#d97706', bgcolor: '#fef3c7' } }}
              >
                🔄 Return to Start
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  endDemo();
                  logout();
                  navigate('/register/hospital');
                }}
                sx={{ bgcolor: '#f59e0b', color: 'white', '&:hover': { bgcolor: '#d97706' }, boxShadow: 'none' }}
              >
                🏥 Register Your Hospital
              </Button>
            </Box>
          </Box>
        )}

        {isDemoActive && currentStepId === '6.1' && (
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => jumpToStep('6.2')}
              sx={{ borderColor: '#f59e0b', color: '#92400e' }}
            >
              View Demo Summary →
            </Button>
          </Box>
        )}

      </Container>
    </Box>
  );
};

export default PatientPortal;
