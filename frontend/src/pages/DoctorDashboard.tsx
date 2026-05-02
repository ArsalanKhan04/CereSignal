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
  ToggleButton,
  ToggleButtonGroup,
  Badge,
  Popover,
  List,
  ListItemButton,
  ListItemText
} from '@mui/material';
import {
  Logout as LogoutIcon,
  LocalHospital as LogoIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { NotificationItem } from '../types';
import Patients from '../components/Patients';

const DoctorDashboard: React.FC = () => {
  const [patientFilter, setPatientFilter] = useState<'assigned' | 'all'>('assigned');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'examined' | 'all'>('pending');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const { user, logout } = useAuth();
  const theme = useTheme();

  // Helper to get initials for the Avatar
  const getInitials = (first?: string, last?: string) => {
    if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
    return 'DR';
  };

  const doctorName = user?.first_name && user?.last_name
    ? `Dr. ${user.first_name} ${user.last_name}`
    : user?.username || 'Doctor';

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const notificationsOpen = Boolean(notificationsAnchor);

  useEffect(() => {
    const loadNotifications = async () => {
      if (!user || user.user_type !== 'doctor') return;
      try {
        const response = await apiClient.getNotifications();
        if (response.status === 200) {
          setNotifications(response.data);
        }
      } catch (error) {
        console.error('Failed to load notifications', error);
      }
    };

    loadNotifications();
  }, [user]);

  const handleNotificationsClick = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchor(event.currentTarget);
  };

  const handleNotificationsClose = () => {
    setNotificationsAnchor(null);
  };

  const handleNotificationRead = async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        const response = await apiClient.markNotificationRead(notification.id);
        if (response.status === 200) {
          setNotifications((prev) =>
            prev.map((item) => (item.id === notification.id ? response.data : item))
          );
        }
      }
      if (notification.patient_id) {
        setSelectedPatientId(notification.patient_id);
      }
      setNotificationsAnchor(null);
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  // --- Design Constants ---
  const primaryColor = theme.palette.primary.main;

  return (
    <Box sx={{
      flexGrow: 1,
      bgcolor: '#f0f2f5',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* --- Top Navigation Bar --- */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          color: 'text.primary'
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ height: 56 }}>
            {/* Logo Section */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, flexGrow: 1 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 26, mr: 1 }} />
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{
                  color: '#1a1a1a',
                  fontWeight: 700,
                  letterSpacing: '-0.4px'
                }}
              >
                Cere<Box component="span" sx={{ color: primaryColor }}>Signal</Box>
              </Typography>
            </Box>

            {/* User Profile Section */}
            <Stack direction="row" spacing={2} alignItems="center">
              {user?.hospital_name && (
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 500,
                    display: { xs: 'none', sm: 'block' },
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.hospital_name}
                </Typography>
              )}

              <Tooltip title="Notifications">
                <IconButton sx={{ color: 'text.secondary' }} onClick={handleNotificationsClick}>
                  <Badge color="error" variant="dot" invisible={unreadCount === 0}>
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              </Tooltip>

              <Chip
                avatar={
                  <Avatar sx={{ bgcolor: theme.palette.primary.light, color: theme.palette.primary.main }}>
                    {getInitials(user?.first_name, user?.last_name)}
                  </Avatar>
                }
                label={doctorName}
                sx={{
                  bgcolor: 'transparent',
                  border: '1px solid',
                  borderColor: 'divider',
                  fontWeight: 500,
                  height: 36,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              />

              <Tooltip title="Logout">
                <IconButton onClick={logout} color="default" sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Popover
        open={notificationsOpen}
        anchorEl={notificationsAnchor}
        onClose={handleNotificationsClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, maxWidth: '90vw' } }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Notifications
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {unreadCount ? `${unreadCount} unread` : 'All caught up'}
          </Typography>
        </Box>
        <List disablePadding>
          {notifications.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No notifications yet.
              </Typography>
            </Box>
          ) : (
            notifications.map((notification) => (
              <ListItemButton
                key={notification.id}
                onClick={() => handleNotificationRead(notification)}
                sx={{
                  alignItems: 'flex-start',
                  bgcolor: notification.is_read ? 'transparent' : 'rgba(25, 118, 210, 0.08)'
                }}
              >
                <ListItemText
                  primary={notification.message}
                  secondary={new Date(notification.created_at).toLocaleString()}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Popover>

      {/* --- Main Content Area --- */}
      <Container maxWidth="xl" sx={{ mt: 3, mb: 3, flexGrow: 1 }}>
        <Fade in={true} timeout={800}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
              bgcolor: '#ffffff',
              minHeight: '70vh',
              boxShadow: '0px 4px 20px rgba(0,0,0,0.02)'
            }}
          >
            {/* Context Header */}
            <Box sx={{
              px: 3,
              py: 2.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2
            }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Overview of your assigned patients and unassigned records.
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={statusFilter}
                exclusive
                onChange={(_event, value) => value && setStatusFilter(value)}
                size="small"
              >
                <ToggleButton value="pending">Pending Review</ToggleButton>
                <ToggleButton value="examined">Examined</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Content Render */}
            <Box sx={{ p: 3, bgcolor: '#fcfcfc' }}>
              <Patients
                doctorViewMode={patientFilter}
                statusFilter={statusFilter}
                showStatusToggle={false}
                showDoctorViewToggle={true}
                onDoctorViewModeChange={setPatientFilter}
                selectedPatientId={selectedPatientId}
                onPatientDetailsClose={() => setSelectedPatientId(null)}
              />
            </Box>
          </Paper>
        </Fade>
      </Container>
    </Box>
  );
};

export default DoctorDashboard;
