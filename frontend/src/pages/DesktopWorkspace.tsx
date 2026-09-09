import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Container,
  Typography,
  Avatar,
  Paper,
  Stack,
  Chip,
  Fade,
} from '@mui/material';
import LogoIcon from '@mui/icons-material/LocalHospital';
import Patients from '../components/Patients';

const DesktopWorkspace: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'examined' | 'all'>('pending');
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f0f2f5' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          color: 'text.primary',
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ height: 56 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, flexGrow: 1 }}>
              <LogoIcon sx={{ color: '#1d4ed8', fontSize: 26, mr: 1 }} />
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{ color: '#1a1a1a', fontWeight: 700, letterSpacing: '-0.4px' }}
              >
                Cere<Box component="span" sx={{ color: '#1d4ed8' }}>Signal</Box>
              </Typography>
              <Chip
                label="Desktop"
                size="small"
                sx={{ ml: 1.5, bgcolor: 'rgba(29, 78, 216, 0.08)', color: '#1d4ed8', fontWeight: 600 }}
              />
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                avatar={<Avatar sx={{ bgcolor: 'rgba(29, 78, 216, 0.16)', color: '#1d4ed8' }}>DT</Avatar>}
                label="Desktop Operator"
                sx={{
                  bgcolor: 'transparent',
                  border: '1px solid',
                  borderColor: 'divider',
                  fontWeight: 500,
                  height: 36,
                }}
              />
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

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
            <Box
              sx={{
                px: 3,
                py: 2.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Overview of EEG reviews and reports in a single desktop workspace.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ p: 3, bgcolor: '#fcfcfc' }}>
              <Patients
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                showStatusToggle={true}
                showDoctorViewToggle={false}
                doctorViewMode="all"
              />
            </Box>
          </Paper>
        </Fade>
      </Container>
    </Box>
  );
};

export default DesktopWorkspace;
