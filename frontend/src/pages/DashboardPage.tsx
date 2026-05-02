import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import DoctorDashboard from './DoctorDashboard';
import TechnicianDashboard from './TechnicianDashboard';
import PatientPortal from './PatientPortal';
import AdminDashboard from './AdminDashboard';
import { Box, CircularProgress, Typography } from '@mui/material';

const DashboardPage: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Typography variant="h6">Please log in to access the dashboard</Typography>
      </Box>
    );
  }

  // Route to appropriate dashboard based on user role
  switch (user.user_type) {
    case 'doctor':
      return <DoctorDashboard />;
    case 'technician':
      return <TechnicianDashboard />;
    case 'patient':
      return <PatientPortal />;
    case 'admin':
      return <AdminDashboard />;
    default:
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <Typography variant="h6">Unknown user type. Please contact support.</Typography>
        </Box>
      );
  }
};

export default DashboardPage;
