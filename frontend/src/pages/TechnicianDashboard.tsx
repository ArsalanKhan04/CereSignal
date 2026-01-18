import React from 'react';
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
  Tooltip
} from '@mui/material';
import {
  People as PeopleIcon,
  Logout as LogoutIcon,
  LocalHospital as LogoIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import Patients from '../components/Patients';

const TechnicianDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const theme = useTheme();

  const technicianName = user?.first_name ? `${user.first_name} ${user.last_name}` : 'Technician';

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
          <Toolbar disableGutters sx={{ height: 70 }}>
            {/* Logo */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 6 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 32, mr: 1.5 }} />
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.5px', color: '#1a1a1a' }}>
                Cere<Box component="span" sx={{ color: primaryColor }}>Signal</Box>
              </Typography>
            </Box>

            {/* Navigation */}
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PeopleIcon sx={{ color: primaryColor }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Patient Registry
              </Typography>
            </Box>

            {/* User Profile */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                avatar={<Avatar sx={{ bgcolor: theme.palette.primary.light, color: theme.palette.primary.main }}>{technicianName[0]}</Avatar>}
                label={technicianName}
                sx={{ 
                  bgcolor: 'transparent', 
                  border: '1px solid', 
                  borderColor: 'divider',
                  fontWeight: 500,
                  height: 40,
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
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        <Fade in={true}>
          <Paper 
            elevation={0} 
            sx={{ 
              borderRadius: 4, 
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
              minHeight: '80vh',
              boxShadow: '0px 4px 20px rgba(0,0,0,0.02)'
            }}
          >
            {/* Header Area */}
            <Box sx={{ 
              px: 4, 
              py: 3, 
              borderBottom: '1px solid', 
              borderColor: 'divider', 
              bgcolor: '#ffffff',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 0.5 }}>
                  Patient Registry
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Create patients and attach EEG files in one step.
                </Typography>
              </Box>

            </Box>

            {/* Content */}
            <Box sx={{ p: 4, bgcolor: '#fcfcfc' }}>
              <Patients />
            </Box>
          </Paper>
        </Fade>
      </Container>

    </Box>
  );
};


export default TechnicianDashboard;
