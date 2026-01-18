import React, { useState } from 'react';
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
  ToggleButtonGroup
} from '@mui/material';
import {
  Logout as LogoutIcon,
  LocalHospital as LogoIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import Patients from '../components/Patients';

const DoctorDashboard: React.FC = () => {
  const [patientFilter, setPatientFilter] = useState<'assigned' | 'all'>('assigned');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'examined' | 'all'>('pending');
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

  // --- Design Constants ---
  const primaryColor = theme.palette.primary.main;

  return (
    <Box sx={{ 
      flexGrow: 1, 
      bgcolor: '#f0f2f5', // Softer gray background
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* --- Top Navigation Bar --- */}
      <AppBar 
        position="sticky" 
        elevation={0} 
        sx={{ 
          bgcolor: 'rgba(255, 255, 255, 0.9)', // Semi-transparent white
          backdropFilter: 'blur(8px)',          // Glassmorphism blur
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
              <Tooltip title="Notifications">
                <IconButton sx={{ color: 'text.secondary' }}>
                  <NotificationsIcon />
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
              />
            </Box>
          </Paper>
        </Fade>
      </Container>
    </Box>
  );
};

export default DoctorDashboard;