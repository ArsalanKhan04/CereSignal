import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Fade,
  useTheme,
  Avatar,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  Logout as LogoutIcon,
  LocalHospital as LogoIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import Patients from '../components/Patients';
import { useDemo } from '../contexts/DemoContext';
import DemoButton from '../components/DemoButton';

const TechnicianDashboard: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'examined' | 'all' | 'report_sent'>('pending');
  const { user, logout } = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const { isActive: isDemoActive, currentStepId, jumpToStep, demoData } = useDemo();

  const technicianName = user?.first_name ? `${user.first_name} ${user.last_name}` : 'Technician';

  useEffect(() => {
    if (isDemoActive && currentStepId === '1.3') {
      jumpToStep('2.0');
    } else if (isDemoActive && currentStepId === '5.1') {
      setStatusFilter('examined');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Custom Colors ---
  const primaryColor = theme.palette.primary.main;

  return (
    <Box sx={{ flexGrow: 1, bgcolor: '#f0f2f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* --- Top Navbar --- */}
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
            {/* Logo */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, flexGrow: 1 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 26, mr: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.4px', color: '#1a1a1a' }}>
                Cere<Box component="span" sx={{ color: primaryColor }}>Signal</Box>
              </Typography>
            </Box>

            {/* User Profile */}
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
              <Chip
                avatar={<Avatar sx={{ bgcolor: theme.palette.primary.light, color: theme.palette.primary.main }}>{technicianName[0]}</Avatar>}
                label={technicianName}
                sx={{ 
                  bgcolor: 'transparent', 
                  border: '1px solid', 
                  borderColor: 'divider',
                  fontWeight: 500,
                  height: 36,
                  '& .MuiChip-label': { px: 2 }
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
        <Fade in={true}>
          <Paper 
            elevation={0} 
            sx={{ 
              borderRadius: 3, 
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
              minHeight: '70vh',
              boxShadow: '0px 4px 20px rgba(0,0,0,0.02)'
            }}
          >
            {/* Header Area */}
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
                  Create patients and attach EEG files in one step.
                </Typography>
              </Box>
              <ToggleButtonGroup
                value={statusFilter}
                exclusive
                onChange={(_event: React.SyntheticEvent, value: 'pending' | 'examined' | 'all' | 'report_sent' | null) => value && setStatusFilter(value)}
                size="small"
              >
                <ToggleButton value="pending">Pending Review</ToggleButton>
                <ToggleButton value="examined">Examined</ToggleButton>
                <ToggleButton value="report_sent">Report Sent</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Content */}
            <Box sx={{ p: 3, bgcolor: '#fcfcfc' }}>
              <Patients
                statusFilter={statusFilter === 'report_sent' ? 'examined' : statusFilter}
                reportSentFilter={statusFilter === 'report_sent' ? true : undefined}
                showStatusToggle={false}
              />
              {isDemoActive && (currentStepId === '2.4' || currentStepId === '2.3' || currentStepId === '2.2') && (
                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {(currentStepId === '2.2' || currentStepId === '2.3' || currentStepId === '2.4') && (
                    <DemoButton
                      label="Show Full Workload →"
                      onClick={() => {
                        jumpToStep('2.4');
                        setStatusFilter('all');
                      }}
                    />
                  )}
                  {currentStepId === '2.4' && (
                    <DemoButton
                      label="Continue as Admin →"
                      onClick={() => {
                        jumpToStep('3.0');
                        navigate('/login');
                      }}
                    />
                  )}
                </Box>
              )}
              {isDemoActive && (currentStepId === '5.1' || currentStepId === '5.2') && (
                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {currentStepId === '5.2' && demoData.portalToken && (
                    <DemoButton
                      label="Open Patient Portal →"
                      onClick={() => {
                        jumpToStep('6.0');
                        navigate(`/patient/portal/${demoData.portalToken}`);
                      }}
                    />
                  )}
                </Box>
              )}
            </Box>
          </Paper>
        </Fade>
      </Container>

    </Box>
  );
};


export default TechnicianDashboard;
