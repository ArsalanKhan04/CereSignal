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
} from '@mui/material';
import { History as HistoryIcon, Close as CloseIcon } from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EEGReportVersion } from '../types';

interface ReportVersionHistoryProps {
  reportId: number;
  reportPatientName: string;
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}

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

  useEffect(() => {
    if (open) {
      fetchVersions();
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

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HistoryIcon fontSize="small" />
            Version History — {reportPatientName}
          </span>
          <IconButton size="small" onClick={onClose}>
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
                      <TableCell>
                        {new Date(v.saved_at).toLocaleString()}
                      </TableCell>
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
                        {v.version_number !== latestVersionNumber && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={restoring !== null}
                            onClick={() => setConfirmVersion(v)}
                            startIcon={restoring === v.id ? <CircularProgress size={14} /> : undefined}
                          >
                            Restore
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
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
