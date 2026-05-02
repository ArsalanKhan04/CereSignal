import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';
import { LocalHospital as LogoIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';

const PatientPortalAccess: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const enter = async () => {
      if (!token) { setError('Invalid portal link.'); return; }
      try {
        const { data } = await apiClient.loginWithPortalToken(token);
        loginWithToken(data.access_token);
        navigate('/dashboard', { replace: true });
      } catch (err: any) {
        setError(err.response?.data?.detail || 'This portal link is invalid or has expired.');
      }
    };
    enter();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LogoIcon sx={{ color: '#2563eb', fontSize: 36 }} />
        <Typography variant="h5" fontWeight="800">CereSignal</Typography>
      </Box>
      {error ? (
        <>
          <Alert severity="error" sx={{ maxWidth: 400 }}>{error}</Alert>
          <Button variant="text" onClick={() => navigate('/')}>Back to login</Button>
        </>
      ) : (
        <>
          <CircularProgress />
          <Typography color="text.secondary">Opening your portal…</Typography>
        </>
      )}
    </Box>
  );
};

export default PatientPortalAccess;
