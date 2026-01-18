import React, { useState } from 'react';
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

const TechnicianDashboard: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'examined' | 'all'>('pending');
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
                onChange={(_event: React.SyntheticEvent, value: 'pending' | 'examined' | 'all' | null) => value && setStatusFilter(value)}
                size="small"
              >
                <ToggleButton value="pending">Pending Review</ToggleButton>
                <ToggleButton value="examined">Examined</ToggleButton>
                <ToggleButton value="all">All</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Content */}
            <Box sx={{ p: 3, bgcolor: '#fcfcfc' }}>
              <Patients statusFilter={statusFilter} showStatusToggle={false} />
            </Box>
          </Paper>
        </Fade>
      </Container>

    </Box>
  );
};


export default TechnicianDashboard;
