import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Fade,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import PersonIcon from '@mui/icons-material/Person';
import { apiClient } from '../../services/api';
import { DevAdminHospitalDetail } from '../../types';

const ROWS_PER_PAGE = 10;

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

interface TabPanelProps {
  value: number;
  index: number;
  children: React.ReactNode;
}
const TabPanel: React.FC<TabPanelProps> = ({ value, index, children }) =>
  value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

const DevAdminHospitalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DevAdminHospitalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [filePage, setFilePage] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [downloadingFile, setDownloadingFile] = useState<number | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient
      .getDevAdminHospitalDetail(Number(id))
      .then((res) => setDetail(res.data))
      .catch(() => setError('Failed to load hospital details.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBulkDownload = async () => {
    if (!detail) return;
    setZipProgress(0);
    try {
      const filename = `ceresignal_${detail.code}_${new Date().toISOString().slice(0, 10)}.zip`;
      await apiClient.downloadHospitalZip(detail.id, filename, (p) => setZipProgress(p));
    } catch {
      setError('Bulk download failed. Please try again.');
    } finally {
      setZipProgress(null);
    }
  };

  const handleFileDownload = async (fileId: number, filename: string) => {
    setDownloadingFile(fileId);
    try {
      await apiClient.downloadHospitalFile(Number(id), fileId, filename);
    } catch {
      setError('File download failed.');
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleReportDownload = async (reportId: number, patientName: string) => {
    setDownloadingReport(reportId);
    try {
      await apiClient.downloadHospitalReport(Number(id), reportId, `report_${patientName.replace(/ /g, '_')}_${reportId}.pdf`);
    } catch {
      setError('Report download failed.');
    } finally {
      setDownloadingReport(null);
    }
  };

  if (loading) {
    return (
      <Box>
        <Skeleton height={40} width={300} sx={{ mb: 2 }} />
        <Skeleton height={120} sx={{ mb: 2 }} />
        <Skeleton height={400} />
      </Box>
    );
  }

  if (error && !detail) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!detail) return null;

  const pagedFiles = detail.files.slice(filePage * ROWS_PER_PAGE, (filePage + 1) * ROWS_PER_PAGE);
  const pagedReports = detail.reports.slice(reportPage * ROWS_PER_PAGE, (reportPage + 1) * ROWS_PER_PAGE);

  const summaryCards = [
    { label: 'Doctors', value: detail.total_doctors, icon: <PersonIcon />, color: '#2563eb' },
    { label: 'Technicians', value: detail.total_technicians, icon: <PeopleIcon />, color: '#7c3aed' },
    { label: 'Patients', value: detail.total_patients, icon: <PeopleIcon />, color: '#059669' },
    { label: 'EEG Files', value: detail.total_files, icon: <FolderIcon />, color: '#d97706' },
  ];

  return (
    <Fade in timeout={400}>
      <Box sx={{ display: 'block' }}>
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3 }}>
          <IconButton onClick={() => navigate('/dev-admin/hospitals')} size="small" sx={{ mt: 0.5 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Typography variant="h2" sx={{ fontWeight: 700 }}>
                {detail.name}
              </Typography>
              <Chip label={detail.code} size="small" variant="outlined" />
              <Chip
                label={detail.is_active ? 'Active' : 'Inactive'}
                size="small"
                color={detail.is_active ? 'success' : 'default'}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {[detail.address, detail.phone, detail.email].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Tooltip title="Downloads all EDF files and finalized PDFs for this hospital">
            <span>
              <Button
                variant="contained"
                startIcon={zipProgress !== null ? <CircularProgress size={14} color="inherit" /> : <FolderZipIcon />}
                onClick={handleBulkDownload}
                disabled={zipProgress !== null}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {zipProgress !== null ? `${zipProgress}%` : 'Download All (ZIP)'}
              </Button>
            </span>
          </Tooltip>
        </Box>

        {zipProgress !== null && (
          <LinearProgress variant="determinate" value={zipProgress} sx={{ mb: 2, borderRadius: 1 }} />
        )}

        {/* Summary cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {summaryCards.map((card) => (
            <Grid key={card.label} size={{ xs: 6, sm: 3 }}>
              <Paper
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  borderLeft: `3px solid ${card.color}`,
                }}
              >
                <Box sx={{ color: card.color }}>{card.icon}</Box>
                <Box>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{card.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* Tabs */}
        <Paper>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2 }}>
            <Tab label={`Staff (${detail.staff.length})`} />
            <Tab label={`EEG Files (${detail.files.length})`} />
            <Tab label={`Reports (${detail.reports.length})`} />
          </Tabs>

          <Box sx={{ p: 2 }}>
            {/* Staff tab */}
            <TabPanel value={tab} index={0}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Specialization</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Last Login</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.staff.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No staff members yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      detail.staff.map((s) => (
                        <TableRow key={s.id} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {[s.title, s.first_name, s.last_name].filter(Boolean).join(' ') || s.username}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={s.user_type}
                              size="small"
                              color={s.user_type === 'doctor' ? 'primary' : 'secondary'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {s.specialization || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {s.email}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {s.phone || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={s.is_active ? 'Active' : 'Inactive'}
                              size="small"
                              color={s.is_active ? 'success' : 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {s.last_login ? formatDate(s.last_login) : 'Never'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </TabPanel>

            {/* EEG Files tab */}
            <TabPanel value={tab} index={1}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Filename</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Condition</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Uploaded</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Download</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedFiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No EEG files yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedFiles.map((f) => (
                        <TableRow key={f.id} hover>
                          <TableCell>
                            <Typography variant="body2">{f.patient_name || '—'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {f.original_filename}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {formatBytes(f.file_size)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={f.processing_status}
                              size="small"
                              color={
                                f.processing_status === 'completed'
                                  ? 'success'
                                  : f.processing_status === 'failed'
                                  ? 'error'
                                  : 'warning'
                              }
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={f.condition}
                              size="small"
                              color={
                                f.condition === 'normal'
                                  ? 'success'
                                  : f.condition === 'abnormal'
                                  ? 'error'
                                  : 'default'
                              }
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {formatDate(f.upload_time)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Download EDF file">
                              <IconButton
                                size="small"
                                onClick={() => handleFileDownload(f.id, f.original_filename)}
                                disabled={downloadingFile === f.id}
                              >
                                {downloadingFile === f.id ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <DownloadIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {detail.files.length > ROWS_PER_PAGE && (
                <TablePagination
                  component="div"
                  count={detail.files.length}
                  rowsPerPage={ROWS_PER_PAGE}
                  rowsPerPageOptions={[ROWS_PER_PAGE]}
                  page={filePage}
                  onPageChange={(_, p) => setFilePage(p)}
                />
              )}
            </TabPanel>

            {/* Reports tab */}
            <TabPanel value={tab} index={2}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Doctor</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>PDF</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Download</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedReports.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No reports yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedReports.map((r) => (
                        <TableRow key={r.id} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {r.patient_name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {r.doctor_name || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={r.is_finalized ? 'Finalized' : 'Draft'}
                              size="small"
                              color={r.is_finalized ? 'success' : 'warning'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={r.has_pdf ? 'PDF ready' : 'No PDF'}
                              size="small"
                              color={r.has_pdf ? 'info' : 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {formatDate(r.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title={r.has_pdf ? 'Download PDF' : 'PDF not available'}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => handleReportDownload(r.id, r.patient_name)}
                                  disabled={!r.has_pdf || downloadingReport === r.id}
                                >
                                  {downloadingReport === r.id ? (
                                    <CircularProgress size={16} />
                                  ) : (
                                    <DownloadIcon
                                      fontSize="small"
                                      sx={{ color: r.has_pdf ? 'primary.main' : 'text.disabled' }}
                                    />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {detail.reports.length > ROWS_PER_PAGE && (
                <TablePagination
                  component="div"
                  count={detail.reports.length}
                  rowsPerPage={ROWS_PER_PAGE}
                  rowsPerPageOptions={[ROWS_PER_PAGE]}
                  page={reportPage}
                  onPageChange={(_, p) => setReportPage(p)}
                />
              )}
            </TabPanel>
          </Box>
        </Paper>
      </Box>
    </Fade>
  );
};

export default DevAdminHospitalDetailPage;
