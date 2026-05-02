import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Button,
  CircularProgress,
  Alert,
  Typography,
  Paper,
  Chip,
  IconButton,
  Divider,
  Stack,
  Box,
} from '@mui/material';
import { History as HistoryIcon, Close as CloseIcon, ArrowBack as BackIcon } from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EEGReportVersion } from '../types';

interface ReportVersionHistoryProps {
  reportId: number;
  reportPatientName: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}

const VersionDetail: React.FC<{
  version: EEGReportVersion;
  isLatest: boolean;
  onBack: () => void;
  onRestore: (v: EEGReportVersion) => void;
  restoring: boolean;
}> = ({ version, isLatest, onBack, onRestore, restoring }) => (
  <>
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <IconButton size="small" onClick={onBack} sx={{ mr: 0.5 }}>
        <BackIcon fontSize="small" />
      </IconButton>
      v{version.version_number} — {version.patient_name}
      {isLatest && <Chip label="current" size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />}
    </DialogTitle>

    <DialogContent dividers>
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          {version.saved_by_name && (
            <Typography variant="caption" color="text.secondary">
              Saved by <strong>{version.saved_by_name}</strong>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {new Date(version.saved_at).toLocaleString()}
          </Typography>
        </Stack>

        {[
          { label: 'Indications', value: version.indications },
          { label: 'Technique', value: version.technique },
          { label: 'Factual Report', value: version.factual_report },
          { label: 'Impression', value: version.impression },
          { label: 'Referring Physician', value: version.ref_physician },
          { label: 'Doctor Info', value: version.doctor_info },
        ].map(({ label, value }) =>
          value ? (
            <Box key={label}>
              <Typography variant="overline" color="text.secondary" display="block" sx={{ lineHeight: 1.6 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {value}
              </Typography>
              <Divider sx={{ mt: 1.5 }} />
            </Box>
          ) : null
        )}
      </Stack>
    </DialogContent>

    <DialogActions>
      <Button onClick={onBack} variant="outlined">Back</Button>
      {!isLatest && (
        <Button
          variant="contained"
          color="warning"
          disabled={restoring}
          startIcon={restoring ? <CircularProgress size={14} /> : undefined}
          onClick={() => onRestore(version)}
        >
          Restore this version
        </Button>
      )}
    </DialogActions>
  </>
);

const ReportVersionHistory: React.FC<ReportVersionHistoryProps> = ({
  reportId,
  reportPatientName,
  open,
  onClose,
  onRestored,
}) => {
  const [versions, setVersions] = useState<EEGReportVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState<number | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<EEGReportVersion | null>(null);
  const [viewingVersion, setViewingVersion] = useState<EEGReportVersion | null>(null);

  useEffect(() => {
    if (open) {
      fetchVersions();
      setViewingVersion(null);
    }
  }, [open, reportId]);

  const fetchVersions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.getReportVersions(reportId);
      setVersions(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error loading version history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirmVersion) return;
    const versionToRestore = confirmVersion;
    setConfirmVersion(null);
    setRestoring(versionToRestore.id);
    try {
      await apiClient.restoreReportVersion(reportId, versionToRestore.id);
      await fetchVersions();
      setViewingVersion(null);
      onRestored();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error restoring version');
    } finally {
      setRestoring(null);
    }
  };

  const latestVersionNumber = versions.length > 0
    ? Math.max(...versions.map(v => v.version_number))
    : 0;

  const handleClose = () => {
    setViewingVersion(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        {viewingVersion ? (
          <VersionDetail
            version={viewingVersion}
            isLatest={viewingVersion.version_number === latestVersionNumber}
            onBack={() => setViewingVersion(null)}
            onRestore={(v) => setConfirmVersion(v)}
            restoring={restoring === viewingVersion.id}
          />
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HistoryIcon fontSize="small" />
                Version History — {reportPatientName}
              </span>
              <IconButton size="small" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </DialogTitle>

            <DialogContent dividers>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                  {error}
                </Alert>
              )}

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <CircularProgress />
                </div>
              ) : versions.length === 0 ? (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                  No version history found for this report.
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Version</strong></TableCell>
                        <TableCell><strong>Saved At</strong></TableCell>
                        <TableCell><strong>Saved By</strong></TableCell>
                        <TableCell><strong>Impression</strong></TableCell>
                        <TableCell align="right"><strong>Actions</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...versions].reverse().map((v) => (
                        <TableRow key={v.id} hover>
                          <TableCell>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              v{v.version_number}
                              {v.version_number === latestVersionNumber && (
                                <Chip label="current" size="small" color="primary" variant="outlined" />
                              )}
                            </span>
                          </TableCell>
                          <TableCell>{new Date(v.saved_at).toLocaleString()}</TableCell>
                          <TableCell>{v.saved_by_name || '—'}</TableCell>
                          <TableCell>
                            {v.impression ? (
                              <Chip
                                label={v.impression.substring(0, 40) + (v.impression.length > 40 ? '…' : '')}
                                size="small"
                                color={v.impression.trim().toLowerCase() === 'normal' ? 'success' : 'default'}
                                variant="outlined"
                              />
                            ) : '—'}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => setViewingVersion(v)}
                              >
                                View
                              </Button>
                              {v.version_number !== latestVersionNumber && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  disabled={restoring !== null}
                                  onClick={() => setConfirmVersion(v)}
                                  startIcon={restoring === v.id ? <CircularProgress size={14} /> : undefined}
                                >
                                  Restore
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DialogContent>

            <DialogActions>
              <Button onClick={handleClose}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={Boolean(confirmVersion)} onClose={() => setConfirmVersion(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Restore Version {confirmVersion?.version_number}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will overwrite the current report with the state saved on{' '}
            <strong>{confirmVersion ? new Date(confirmVersion.saved_at).toLocaleString() : ''}</strong>.
            A new version entry will be saved to track this rollback.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmVersion(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handleRestore}>
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ReportVersionHistory;
