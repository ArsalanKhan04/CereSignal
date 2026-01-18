import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Tabs,
  Tab,
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
  People as PeopleIcon,
  Description as FileIcon,
  Assessment as ReportIcon,
  Logout as LogoutIcon,
  LocalHospital as LogoIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import Patients from '../components/Patients';
import Files from '../components/Files';
import ReportsPage from './ReportsPage';
import Events from '../components/Events';

// --- Components ---

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`doctor-tabpanel-${index}`}
      aria-labelledby={`doctor-tab-${index}`}
      {...other}
      style={{ width: '100%' }}
    >
      {value === index && (
        <Fade in={true} timeout={600}>
          <Box>{children}</Box>
        </Fade>
      )}
    </div>
  );
}

const DoctorDashboard: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [patientFilter, setPatientFilter] = useState<'assigned' | 'all'>('assigned');
  const { user, logout } = useAuth();
  const theme = useTheme();

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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
          <Toolbar disableGutters sx={{ height: 70 }}>
            {/* Logo Section */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 6 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 32, mr: 1.5 }} />
              <Typography 
                variant="h5" 
                noWrap 
                component="div" 
                sx={{ 
                  color: '#1a1a1a', 
                  fontWeight: 800, 
                  letterSpacing: '-0.5px' 
                }}
              >
                Cere<Box component="span" sx={{ color: primaryColor }}>Signal</Box>
              </Typography>
            </Box>

            {/* Navigation Tabs */}
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange} 
              aria-label="doctor dashboard tabs"
              sx={{ 
                flexGrow: 1,
                '& .MuiTab-root': { 
                  textTransform: 'none', 
                  fontWeight: 600, 
                  fontSize: '1rem', 
                  minHeight: 70,
                  mx: 1
                } 
              }}
              textColor="primary"
              indicatorColor="primary"
            >
              <Tab icon={<PeopleIcon sx={{ mb: 0, mr: 1 }} />} iconPosition="start" label="My Patients" />
              <Tab icon={<FileIcon sx={{ mb: 0, mr: 1 }} />} iconPosition="start" label="EEG Files" />
              <Tab icon={<ReportIcon sx={{ mb: 0, mr: 1 }} />} iconPosition="start" label="EEG Analysis" />
              <Tab icon={<ReportIcon sx={{ mb: 0, mr: 1 }} />} iconPosition="start" label="Reports" />
            </Tabs>

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
                  height: 40,
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
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        <Fade in={true} timeout={800}>
          <Paper 
            elevation={0} 
            sx={{ 
              borderRadius: 4, 
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
              bgcolor: '#ffffff',
              minHeight: '80vh',
              boxShadow: '0px 4px 20px rgba(0,0,0,0.02)' // Very subtle shadow
            }}
          >
            {/* Context Header */}
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
                  {tabValue === 0 && 'Patient Management'}
                  {tabValue === 1 && 'EEG File Repository'}
                  {tabValue === 2 && 'EEG File Analysis'}
                  {tabValue === 3 && 'Analytics & Reports'}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {tabValue === 0 && 'Overview of your assigned patients and unassigned records.'}
                  {tabValue === 1 && 'Access, review, and analyze uploaded EEG recordings.'}
                  {tabValue === 2 && 'Select an EEG file to view its analysis and events.'}
                  {tabValue === 3 && 'Generate detailed clinical reports and insights.'}
                </Typography>
              </Box>
              {tabValue === 0 && (
                <ToggleButtonGroup
                  value={patientFilter}
                  exclusive
                  onChange={(_event, value) => value && setPatientFilter(value)}
                  size="small"
                >
                  <ToggleButton value="assigned">Assigned to me</ToggleButton>
                  <ToggleButton value="all">All patients</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Box>

            {/* Content Render */}
            <Box sx={{ p: 4, bgcolor: '#fcfcfc' }}>
              <TabPanel value={tabValue} index={0}>
                <Patients doctorViewMode={patientFilter} />
              </TabPanel>
              <TabPanel value={tabValue} index={1}>
                <Files />
              </TabPanel>
              <TabPanel value={tabValue} index={2}>
                <Events />
              </TabPanel>
              <TabPanel value={tabValue} index={3}>
                <ReportsPage />
              </TabPanel>
            </Box>
          </Paper>
        </Fade>
      </Container>
    </Box>
  );
};

export default DoctorDashboard;