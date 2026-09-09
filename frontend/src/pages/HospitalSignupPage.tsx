import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Link,
  CircularProgress,
  Grid,
  InputAdornment,
  Fade,
  useTheme,
  Stack,
  Paper,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import BadgeIcon from '@mui/icons-material/Badge';
import HospitalIcon from '@mui/icons-material/LocalHospital';
import PhoneIcon from '@mui/icons-material/Phone';
import ArrowIcon from '@mui/icons-material/ArrowForward';
import LogoIcon from '@mui/icons-material/LocalHospital';
import GroupIcon from '@mui/icons-material/Group';
import BarChartIcon from '@mui/icons-material/BarChart';
import SecurityIcon from '@mui/icons-material/Security';
import LocationIcon from '@mui/icons-material/LocationOn';
import FormAlert from '../components/FormAlert';
import FormTextField from '../components/FormTextField';
import DemoButton from '../components/DemoButton';
import { useDemo } from '../contexts/DemoContext';
import {
  validateUsername, validateEmail, validatePassword, validateConfirmPassword,
  validateName, validatePhone, validateHospitalName,
  collectErrors, extractApiErrors,
} from '../utils/validation';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { HospitalAdminRegisterRequest } from '../types';

const HospitalSignupPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isActive: isDemoActive, jumpToStep, demoData } = useDemo();

  const [formData, setFormData] = useState<HospitalAdminRegisterRequest>({
    hospital_name: '',
    hospital_address: '',
    hospital_phone: '',
    hospital_email: '',
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    confirm_password: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (fieldErrors[name]) {
      setFieldErrors(prev => { const next = {...prev}; delete next[name]; return next; });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const errors = collectErrors(
      validateHospitalName(formData.hospital_name),
      validateName(formData.first_name, 'first_name', 'First name'),
      validateName(formData.last_name, 'last_name', 'Last name'),
      validateUsername(formData.username),
      validateEmail(formData.email),
      validatePassword(formData.password),
      validateConfirmPassword(formData.password, formData.confirm_password),
      validatePhone(formData.hospital_phone, 'hospital_phone'),
      validateEmail(formData.hospital_email, 'hospital_email'),
    );
    if (errors.length > 0) {
      const fieldErrMap: Record<string, string> = {};
      errors.forEach(e => { fieldErrMap[e.field] = e.message; });
      setFieldErrors(fieldErrMap);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    try {
      await apiClient.registerHospital(formData);
      setSuccess('Registration successful! Redirecting...');
      await login({ username: formData.username, password: formData.password });
      jumpToStep('1.1');
      navigate('/dashboard');
    } catch (err: any) {
      const responseData = err.response?.data;
      const extracted = extractApiErrors(responseData?.detail || responseData?.errors);
      if (extracted.fields.length > 0) {
        const fieldErrMap: Record<string, string> = {};
        extracted.fields.forEach((f: any) => { fieldErrMap[f.field] = f.message; });
        setFieldErrors(fieldErrMap);
      }
      setError(extracted.general || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const primaryMain = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark;

  return (
    <Grid container sx={{ minHeight: '100vh', bgcolor: '#f4f6f8' }}>

      {/* Left sidebar */}
      <Grid
        size={{ xs: 0, md: 4, lg: 3 }}
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          bgcolor: '#0a1929',
          background: `linear-gradient(180deg, ${primaryDark} 0%, #0a1929 100%)`,
          color: 'white',
          p: 6,
          position: 'sticky',
          top: 0,
          height: '100vh',
          borderRight: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 8 }}>
          <LogoIcon sx={{ fontSize: 40, mr: 2, color: 'white' }} />
          <Typography variant="h5" fontWeight="800">CereSignal</Typography>
        </Box>

        <Typography variant="h4" fontWeight="700" sx={{ mb: 2 }}>
          Register Your Hospital
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', mb: 6 }}>
          Set up your hospital workspace and start managing your team with AI-powered EEG analysis.
        </Typography>

        <List>
          {[
            { icon: <GroupIcon />, text: 'Manage Doctors & Technicians' },
            { icon: <BarChartIcon />, text: 'Hospital-Wide Analytics' },
            { icon: <SecurityIcon />, text: 'Isolated Data Per Hospital' },
            { icon: <HospitalIcon />, text: 'Invite Staff via Email' },
          ].map((item, index) => (
            <ListItem key={index} disableGutters sx={{ mb: 2 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.1)', p: 1, borderRadius: 2, display: 'flex' }}>
                  {React.cloneElement(item.icon, { sx: { color: primaryMain, fontSize: 20 } })}
                </Box>
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{ fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}
              />
            </ListItem>
          ))}
        </List>

        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
            © 2025 CereSignal Systems Inc.
          </Typography>
        </Box>
      </Grid>

      {/* Right: scrollable form */}
      <Grid
        size={{ xs: 12, md: 8, lg: 9 }}
        sx={{ p: { xs: 2, sm: 4, md: 8 }, display: 'flex', justifyContent: 'center' }}
      >
        <Fade in={true} timeout={600}>
          <Box sx={{ width: '100%', maxWidth: 800 }}>

            {/* Mobile header */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', mb: 4 }}>
              <LogoIcon sx={{ color: primaryMain, mr: 1, fontSize: 32 }} />
              <Typography variant="h6" fontWeight="800">CereSignal</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 4 }}>
              <Box>
                <Typography variant="h4" fontWeight="800" sx={{ color: '#1a1a1a', mb: 1 }}>
                  Hospital Registration
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Create your hospital workspace and admin account.
                </Typography>
              </Box>
              <Chip label="Admin Account" color="primary" variant="outlined" size="small" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'flex' } }} />
            </Box>

            <FormAlert error={error} success={success} onDismiss={() => { setError(''); setSuccess(''); }} autoHideMs={3000} />

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={4}>

                {/* Card 1: Hospital Details */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <HospitalIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Hospital Details
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12 }}>
                      <FormTextField
                        required fullWidth label="Hospital Name" name="hospital_name"
                        value={formData.hospital_name} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.hospital_name}
                        InputProps={{ startAdornment: <InputAdornment position="start"><HospitalIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <FormTextField
                        fullWidth label="Address (optional)" name="hospital_address"
                        value={formData.hospital_address} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.hospital_address}
                        InputProps={{ startAdornment: <InputAdornment position="start"><LocationIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        fullWidth label="Hospital Phone (optional)" name="hospital_phone"
                        value={formData.hospital_phone} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.hospital_phone}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        fullWidth label="Hospital Email (optional)" name="hospital_email"
                        type="email" value={formData.hospital_email} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.hospital_email}
                        InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                {/* Card 2: Admin Account */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <SecurityIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Admin Account
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        required fullWidth label="First Name" name="first_name"
                        value={formData.first_name} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.first_name}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        required fullWidth label="Last Name" name="last_name"
                        value={formData.last_name} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.last_name}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        required fullWidth label="Username" name="username"
                        value={formData.username} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.username}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        required fullWidth label="Admin Email" name="email"
                        type="email" value={formData.email} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.email}
                        InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        required fullWidth type="password" label="Password" name="password"
                        value={formData.password} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.password}
                        InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormTextField
                        required fullWidth type="password" label="Confirm Password" name="confirm_password"
                        value={formData.confirm_password} onChange={handleChange}
                        disabled={isLoading}
                        fieldError={fieldErrors.confirm_password}
                        InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                {isDemoActive && (
                  <Box sx={{ mb: 2 }}>
                    <DemoButton
                      label="⚡ Autofill Demo Data"
                      fullWidth
                      onClick={() => {
                        setFormData({
                          hospital_name: demoData.hospitalName,
                          hospital_address: '1000 Medical Plaza Drive, Chicago, IL',
                          hospital_phone: '+1 (312) 555-0142',
                          hospital_email: `admin.${demoData.suffix}@demo.local`,
                          first_name: 'Alex',
                          last_name: 'Morgan',
                          username: demoData.adminUsername,
                          email: `admin.${demoData.suffix}@demo.local`,
                          password: demoData.adminPassword,
                          confirm_password: demoData.adminPassword,
                        });
                        jumpToStep('1.0');
                      }}
                    />
                  </Box>
                )}

                <Box>
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    size="large"
                    disabled={isLoading}
                    endIcon={!isLoading && <ArrowIcon />}
                    sx={{
                      py: 2,
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      borderRadius: 3,
                      boxShadow: '0 8px 24px rgba(25, 118, 210, 0.3)',
                      textTransform: 'none',
                      transition: 'all 0.2s',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 12px 32px rgba(25, 118, 210, 0.4)',
                      },
                    }}
                  >
                    {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Hospital Workspace'}
                  </Button>
                </Box>

                <Box sx={{ textAlign: 'center', pb: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Already registered?{' '}
                    <Link component={RouterLink} to="/" sx={{ fontWeight: 600, textDecoration: 'none', color: 'primary.main' }}>
                      Sign in here
                    </Link>
                  </Typography>
                </Box>

              </Stack>
            </Box>
          </Box>
        </Fade>
      </Grid>
    </Grid>
  );
};

export default HospitalSignupPage;
