import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useDemo } from '../contexts/DemoContext';
import DemoButton from '../components/DemoButton';
import {
  Box,
  Button,
  Typography,
  Link,
  CircularProgress,
  Divider,
  InputAdornment,
  Stack,
  Fade,
  useTheme,
  Paper,
  Grid,
} from '@mui/material';
import {
  Person as PersonIcon,
  Lock as LockIcon,
  LocalHospital as LogoIcon,
  ArrowForward as ArrowIcon,
  Science as ScienceIcon,
  Psychology as BrainIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { LoginRequest } from '../types';
import { validateUsername, validatePassword, collectErrors, extractApiErrors } from '../utils/validation';
import FormAlert from '../components/FormAlert';
import FormTextField from '../components/FormTextField';

const LoginPage: React.FC = () => {
  const theme = useTheme();
  const [formData, setFormData] = useState<LoginRequest>({
    username: '',
    password: '',
  });
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { isActive: isDemoActive, demoData, jumpToStep } = useDemo();

  const autofillDemo = (username: string, password: string) => {
    setFormData({ username, password });
  };

  const handleDismiss = () => {
    setError('');
    setSuccess('');
    setFieldErrors({});
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSuccess('');

    const errors = collectErrors(
      validateUsername(formData.username),
      validatePassword(formData.password),
    );
    if (errors.length > 0) {
      const fieldErrMap: Record<string, string> = {};
      errors.forEach(e => { fieldErrMap[e.field] = e.message; });
      setFieldErrors(fieldErrMap);
      return;
    }

    setIsLoading(true);
    try {
      await login(formData);
      navigate('/dashboard');
    } catch (err: any) {
      const responseData = err.response?.data;
      const { general, fields } = extractApiErrors(responseData?.errors ?? responseData?.detail);
      if (fields.length > 0) {
        const fieldErrMap: Record<string, string> = {};
        fields.forEach((f: any) => { fieldErrMap[f.field] = f.message; });
        setFieldErrors(fieldErrMap);
      }
      setError(general || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const primaryMain = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark;

  return (
    <Grid container sx={{ minHeight: '100vh' }}>
      
      {/* --- Left Side: Login Form --- */}
      <Grid 
        size={{ xs: 12, md: 5, lg: 4 }} 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          bgcolor: '#ffffff',
          position: 'relative',
          boxShadow: { md: '10px 0 30px rgba(0,0,0,0.05)' },
          zIndex: 2
        }}
      >
        <Fade in={true} timeout={1000}>
          <Box 
            sx={{ 
              width: '100%', 
              maxWidth: 450, 
              p: { xs: 4, sm: 6 },
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            {/* Mobile Logo (only visible on small screens) */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 4, alignItems: 'center' }}>
              <LogoIcon sx={{ color: primaryMain, fontSize: 40, mr: 1 }} />
              <Typography variant="h5" fontWeight="800" color="text.primary">CereSignal</Typography>
            </Box>

            <Box sx={{ width: '100%', mb: 4 }}>
              <Typography variant="h4" component="h1" fontWeight="800" sx={{ mb: 1, color: '#1a1a1a' }}>
                Welcome Back
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Sign in to access your dashboard.
              </Typography>
            </Box>

            <FormAlert error={error} success={success} onDismiss={handleDismiss} />

            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <Stack spacing={3}>
                <FormTextField
                  required
                  fullWidth
                  id="username"
                  label="Username"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  value={formData.username}
                  onChange={handleChange}
                  disabled={isLoading}
                  fieldError={fieldErrors.username}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8f9fa' } }}
                />

                <FormTextField
                  required
                  fullWidth
                  name="password"
                  label="Password"
                  type="password"
                  id="password"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  fieldError={fieldErrors.password}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8f9fa' } }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isLoading}
                  endIcon={!isLoading && <ArrowIcon />}
                  sx={{
                    py: 1.8,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 2,
                    textTransform: 'none',
                    boxShadow: '0 8px 16px rgba(25, 118, 210, 0.25)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 12px 20px rgba(25, 118, 210, 0.35)',
                    },
                  }}
                >
                  {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
                </Button>
              </Stack>
            </Box>

            {isDemoActive && (
              <Box sx={{ width: '100%', mt: 3 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 1 }}>
                  DEMO QUICK-LOGIN
                </Typography>
                <Stack spacing={1}>
                  <DemoButton
                    label="🔑 Login as Admin"
                    fullWidth
                    onClick={() => {
                      autofillDemo(demoData.adminUsername, demoData.adminPassword);
                      jumpToStep('3.1');
                    }}
                  />
                  <DemoButton
                    label="🔑 Login as Technician"
                    fullWidth
                    onClick={() => {
                      autofillDemo(demoData.techUsername, demoData.techPassword);
                      jumpToStep('5.1');
                    }}
                  />
                  <DemoButton
                    label="🔑 Login as Doctor"
                    fullWidth
                    onClick={() => {
                      autofillDemo(demoData.docUsername, demoData.docPassword);
                      jumpToStep('4.0');
                    }}
                  />
                </Stack>
              </Box>
            )}

            <Divider sx={{ width: '100%', my: 4 }}>
              <Typography variant="caption" color="text.secondary" fontWeight="600">
                NEW TO CEREIGNAL?
              </Typography>
            </Divider>

            <Box sx={{ width: '100%' }}>
              <Button
                component={RouterLink}
                to="/register/hospital"
                variant="outlined"
                fullWidth
                sx={{
                  borderRadius: 20,
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: 'divider',
                  color: 'text.secondary',
                  '&:hover': {
                    borderColor: primaryMain,
                    color: primaryMain,
                    bgcolor: 'transparent',
                  },
                }}
              >
                Register your hospital
              </Button>
            </Box>
            </Box>
          </Fade>
        </Grid>


      {/* --- Right Side: Visual Branding (Hidden on Mobile) --- */}
      <Grid 
        size={{ xs: 0, md: 7, lg: 8 }}
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          bgcolor: '#0a1929', // Fallback color
          background: `radial-gradient(circle at 10% 20%, ${primaryDark} 0%, #0a1929 90%)`,
          color: 'white',
          overflow: 'hidden'
        }}
      >
        {/* Decorative Background Elements */}
        <Box 
          sx={{ 
            position: 'absolute', 
            top: -100, 
            right: -100, 
            width: 400, 
            height: 400, 
            bgcolor: primaryMain, 
            opacity: 0.1, 
            borderRadius: '50%',
            filter: 'blur(80px)' 
          }} 
        />
        <Box 
          sx={{ 
            position: 'absolute', 
            bottom: -50, 
            left: -50, 
            width: 300, 
            height: 300, 
            bgcolor: 'secondary.main', 
            opacity: 0.1, 
            borderRadius: '50%',
            filter: 'blur(60px)' 
          }} 
        />

        {/* Branding Content */}
        <Fade in={true} timeout={1500}>
          <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 600, px: 8 }}>
            <Box 
              sx={{ 
                width: 80, 
                height: 80, 
                bgcolor: 'rgba(255,255,255,0.1)', 
                backdropFilter: 'blur(10px)',
                borderRadius: 3, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                mb: 4,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
              }}
            >
              <BrainIcon sx={{ fontSize: 48, color: 'white' }} />
            </Box>

            <Typography variant="h2" fontWeight="800" sx={{ mb: 2, letterSpacing: '-1px' }}>
              CereSignal
            </Typography>
            
            <Typography variant="h5" sx={{ mb: 4, fontWeight: 400, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              Advanced EEG analysis and patient management platform for modern healthcare providers.
            </Typography>

            <Stack direction="row" spacing={3} sx={{ color: 'rgba(255,255,255,0.6)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ScienceIcon fontSize="small" />
                <Typography variant="subtitle2">AI-Powered Analysis</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LogoIcon fontSize="small" />
                <Typography variant="subtitle2">Clinical Grade Security</Typography>
              </Box>
            </Stack>
          </Box>
        </Fade>
      </Grid>

    </Grid>
  );
};

export default LoginPage;