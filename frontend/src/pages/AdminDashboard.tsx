import React, { useEffect, useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Avatar,
  Paper,
  Chip,
  Fade,
  useTheme,
  IconButton,
  Tooltip,
  Stack,
  Grid,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  LocalHospital as LogoIcon,
  Group as GroupIcon,
  BarChart as BarChartIcon,
  Send as SendIcon,
  PersonAdd as PersonAddIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as PendingIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { AdminStats, StaffInvitation, StaffMember } from '../types';

const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const theme = useTheme();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [activeTab, setActiveTab] = useState(0);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'doctor' | 'technician'>('doctor');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [dataLoading, setDataLoading] = useState(true);

  const adminName = user?.first_name && user?.last_name
    ? `${user.first_name} ${user.last_name}`
    : user?.username || 'Admin';

  const getInitials = (first?: string, last?: string) => {
    if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
    return 'AD';
  };

  useEffect(() => {
    const loadData = async () => {
      setDataLoading(true);
      try {
        const [statsRes, staffRes, invitesRes] = await Promise.all([
          apiClient.getAdminStats(),
          apiClient.getStaff(),
          apiClient.getInvitations(),
        ]);
        setStats(statsRes.data);
        setStaff(staffRes.data);
        setInvitations(invitesRes.data);
      } catch (err) {
        console.error('Failed to load admin data', err);
      } finally {
        setDataLoading(false);
      }
    };
    loadData();
  }, []);

  const handleToggleActive = async (userId: number) => {
    try {
      const res = await apiClient.toggleStaffActive(userId);
      setStaff(prev => prev.map(m => m.id === userId ? { ...m, is_active: res.data.is_active } : m));
    } catch (err) {
      console.error('Failed to toggle staff active', err);
    }
  };

  const handleSendInvite = async () => {
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail) {
      setInviteError('Please enter an email address.');
      return;
    }
    setInviteLoading(true);
    try {
      await apiClient.sendInvitation({ email: inviteEmail, role: inviteRole });
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      // Refresh invitations list
      const invitesRes = await apiClient.getInvitations();
      setInvitations(invitesRes.data);
      // Update pending count in stats
      if (stats) {
        setStats({ ...stats, pending_invitations: stats.pending_invitations + 1 });
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to send invitation.';
      setInviteError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setInviteLoading(false);
    }
  };

  const daysUntilExpiry = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const filteredStaff = staff.filter(m =>
    activeTab === 0 ? m.user_type === 'doctor' : m.user_type === 'technician'
  );

  const statCards = stats ? [
    { label: 'Active Doctors', value: stats.total_doctors, color: theme.palette.primary.main },
    { label: 'Active Technicians', value: stats.total_technicians, color: theme.palette.secondary.main },
    { label: 'Total Patients', value: stats.total_patients, color: '#0891b2' },
    { label: 'Pending Reports', value: stats.pending_reports, color: '#d97706' },
  ] : [];

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* AppBar */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Toolbar sx={{ px: { xs: 2, sm: 3 } }}>
          <LogoIcon sx={{ color: 'primary.main', mr: 1.5, fontSize: 28 }} />
          <Typography variant="h6" fontWeight="800" color="text.primary" sx={{ flexGrow: 1 }}>
            CereSignal
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              label="Admin"
              size="small"
              color="primary"
              sx={{ fontWeight: 700, fontSize: '0.7rem' }}
            />
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
              {getInitials(user?.first_name, user?.last_name)}
            </Avatar>
            <Typography variant="body2" fontWeight="600" color="text.primary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {adminName}
            </Typography>
            <Tooltip title="Logout">
              <IconButton onClick={logout} size="small" sx={{ color: 'text.secondary' }}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Fade in={!dataLoading} timeout={500}>
          <Box>
            {/* Welcome */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h4" fontWeight="800" sx={{ mb: 0.5 }}>
                Hospital Dashboard
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Manage your team and track hospital activity.
              </Typography>
            </Box>

            {/* Stat Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {dataLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
                      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
                        <CircularProgress size={20} />
                      </Paper>
                    </Grid>
                  ))
                : statCards.map((card) => (
                    <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 3 }}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 3,
                          borderRadius: 3,
                          border: '1px solid',
                          borderColor: 'divider',
                          textAlign: 'center',
                          transition: 'all 0.2s',
                          '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)', transform: 'translateY(-2px)' },
                        }}
                      >
                        <Typography variant="h3" fontWeight="800" sx={{ color: card.color, mb: 0.5 }}>
                          {card.value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" fontWeight="500">
                          {card.label}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
            </Grid>

            {/* Main Content */}
            <Grid container spacing={3}>
              {/* Staff Table */}
              <Grid size={{ xs: 12, lg: 8 }}>
                <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                  <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6" fontWeight="700" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GroupIcon color="primary" fontSize="small" /> Staff Management
                    </Typography>
                  </Box>
                  <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}
                  >
                    <Tab label={`Doctors (${staff.filter(m => m.user_type === 'doctor').length})`} />
                    <Tab label={`Technicians (${staff.filter(m => m.user_type === 'technician').length})`} />
                  </Tabs>
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Specialization</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {dataLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                              <CircularProgress size={24} />
                            </TableCell>
                          </TableRow>
                        ) : filteredStaff.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                              No {activeTab === 0 ? 'doctors' : 'technicians'} yet. Send an invitation to get started.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredStaff.map((member) => (
                            <TableRow key={member.id} hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                  <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', fontSize: '0.75rem' }}>
                                    {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" fontWeight="600">
                                      {member.title ? `${member.title} ` : ''}{member.first_name} {member.last_name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">@{member.username}</Typography>
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">{member.email}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="text.secondary">
                                  {member.specialization || '—'}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={member.is_active ? 'Active' : 'Inactive'}
                                  size="small"
                                  color={member.is_active ? 'success' : 'default'}
                                  variant="outlined"
                                  sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color={member.is_active ? 'error' : 'success'}
                                  onClick={() => handleToggleActive(member.id)}
                                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
                                >
                                  {member.is_active ? 'Deactivate' : 'Reactivate'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Grid>

              {/* Right Column */}
              <Grid size={{ xs: 12, lg: 4 }}>
                <Stack spacing={3}>
                  {/* Invite Staff */}
                  <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6" fontWeight="700" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PersonAddIcon color="primary" fontSize="small" /> Invite Staff
                    </Typography>
                    <Stack spacing={2}>
                      <TextField
                        fullWidth size="small" label="Email address" type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        disabled={inviteLoading}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendInvite(); } }}
                      />
                      <FormControl fullWidth size="small">
                        <InputLabel>Role</InputLabel>
                        <Select
                          value={inviteRole}
                          label="Role"
                          onChange={(e) => setInviteRole(e.target.value as 'doctor' | 'technician')}
                          disabled={inviteLoading}
                        >
                          <MenuItem value="doctor">Doctor</MenuItem>
                          <MenuItem value="technician">Technician</MenuItem>
                        </Select>
                      </FormControl>
                      {inviteError && <Alert severity="error" sx={{ borderRadius: 2 }}>{inviteError}</Alert>}
                      {inviteSuccess && <Alert severity="success" sx={{ borderRadius: 2 }}>{inviteSuccess}</Alert>}
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleSendInvite}
                        disabled={inviteLoading}
                        endIcon={!inviteLoading && <SendIcon />}
                        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                      >
                        {inviteLoading ? <CircularProgress size={20} color="inherit" /> : 'Send Invitation'}
                      </Button>
                    </Stack>
                  </Paper>

                  {/* Pending Invitations */}
                  <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6" fontWeight="700" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BarChartIcon color="primary" fontSize="small" /> Invitations
                    </Typography>
                    {dataLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={20} />
                      </Box>
                    ) : invitations.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        No invitations sent yet.
                      </Typography>
                    ) : (
                      <List disablePadding>
                        {invitations.slice(0, 10).map((inv, i) => (
                          <React.Fragment key={inv.id}>
                            {i > 0 && <Divider />}
                            <ListItem disableGutters sx={{ py: 1.5 }}>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" fontWeight="600" noWrap sx={{ maxWidth: 160 }}>
                                      {inv.invited_email}
                                    </Typography>
                                    <Chip
                                      label={inv.used_at ? 'Accepted' : `${daysUntilExpiry(inv.expires_at)}d`}
                                      size="small"
                                      color={inv.used_at ? 'success' : daysUntilExpiry(inv.expires_at) === 0 ? 'error' : 'warning'}
                                      variant="outlined"
                                      icon={inv.used_at ? <CheckCircleIcon sx={{ fontSize: '12px !important' }} /> : <PendingIcon sx={{ fontSize: '12px !important' }} />}
                                      sx={{ fontWeight: 600, fontSize: '0.65rem', height: 22 }}
                                    />
                                  </Box>
                                }
                                secondary={
                                  <Chip
                                    label={inv.role.charAt(0).toUpperCase() + inv.role.slice(1)}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 0.5, height: 18, fontSize: '0.65rem', fontWeight: 600, borderColor: 'divider' }}
                                  />
                                }
                              />
                            </ListItem>
                          </React.Fragment>
                        ))}
                      </List>
                    )}
                  </Paper>
                </Stack>
              </Grid>
            </Grid>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
};

export default AdminDashboard;
