import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Chip,
  Collapse,
  Fade,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DoneIcon from '@mui/icons-material/Done';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { apiClient } from '../../services/api';
import { DevAdminContact } from '../../types';

const ROWS_PER_PAGE = 20;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const ExpandableMessage: React.FC<{ message?: string }> = ({ message }) => {
  const [open, setOpen] = useState(false);
  if (!message) return <Typography variant="body2" color="text.secondary">—</Typography>;

  const isLong = message.length > 80;
  return (
    <Box>
      {isLong ? (
        <>
          <Collapse in={open} collapsedSize={24}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
              {message}
            </Typography>
          </Collapse>
          <IconButton size="small" onClick={() => setOpen(!open)} sx={{ mt: -0.5 }}>
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </>
      ) : (
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{message}</Typography>
      )}
    </Box>
  );
};

const DevAdminContacts: React.FC = () => {
  const [contacts, setContacts] = useState<DevAdminContact[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchContacts = useCallback(
    async (p: number, uo: boolean) => {
      setLoading(true);
      try {
        const res = await apiClient.getDevAdminContacts(p * ROWS_PER_PAGE, ROWS_PER_PAGE, uo);
        setContacts(res.data.items);
        setTotal(res.data.total);
        setUnreadCount(res.data.unread_count);
      } catch {
        setError('Failed to load contacts.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchContacts(page, unreadOnly);
  }, [page, unreadOnly, fetchContacts]);

  const handleToggleRead = async (contact: DevAdminContact) => {
    setTogglingId(contact.id);
    try {
      const res = await apiClient.markContactRead(contact.id);
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? res.data : c)));
      setUnreadCount((prev) => (res.data.is_read ? Math.max(0, prev - 1) : prev + 1));
    } catch {
      setError('Failed to update contact status.');
    } finally {
      setTogglingId(null);
    }
  };

  const INTEREST_LABELS: Record<string, string> = {
    pilot: 'Pilot',
    demo: 'Demo',
    pricing: 'Pricing',
    research: 'Research',
    other: 'Other',
  };

  return (
    <Fade in timeout={400}>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h2" sx={{ fontWeight: 700 }}>
              Contact Messages
            </Typography>
            {unreadCount > 0 && (
              <Chip
                label={`${unreadCount} unread`}
                size="small"
                color="warning"
                variant="filled"
              />
            )}
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={unreadOnly}
                onChange={(e) => {
                  setPage(0);
                  setUnreadOnly(e.target.checked);
                }}
                size="small"
              />
            }
            label={<Typography variant="body2">Unread only</Typography>}
          />
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Organization</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Country</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Interest</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Message</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Read</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Loading…</Typography>
                    </TableCell>
                  </TableRow>
                ) : contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {unreadOnly ? 'No unread messages.' : 'No contact submissions yet.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map((c) => (
                    <TableRow
                      key={c.id}
                      hover
                      sx={{ bgcolor: c.is_read ? 'transparent' : 'rgba(37,99,235,0.04)' }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: c.is_read ? 400 : 600 }}>
                          {c.first_name} {c.last_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                          {c.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {c.hospital || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {c.role || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {c.country || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {c.interest ? (
                          <Chip
                            label={INTEREST_LABELS[c.interest] ?? c.interest}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <ExpandableMessage message={c.message ?? undefined} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {formatDate(c.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={c.is_read ? 'Read' : 'Unread'}
                          size="small"
                          color={c.is_read ? 'default' : 'warning'}
                          variant={c.is_read ? 'outlined' : 'filled'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={c.is_read ? 'Mark as unread' : 'Mark as read'}>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleRead(c)}
                            disabled={togglingId === c.id}
                            sx={{ color: c.is_read ? 'text.disabled' : 'success.main' }}
                          >
                            <DoneIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            rowsPerPage={ROWS_PER_PAGE}
            rowsPerPageOptions={[ROWS_PER_PAGE]}
            page={page}
            onPageChange={(_, p) => setPage(p)}
          />
        </Paper>
      </Box>
    </Fade>
  );
};

export default DevAdminContacts;
