import React, { useState, useEffect } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
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
import {
  Person as PersonIcon,
  Lock as LockIcon,
  Badge as BadgeIcon,
  LocalHospital as HospitalIcon,
  WorkHistory as ExperienceIcon,
  MedicalServices as SpecializationIcon,
  Phone as PhoneIcon,
  Description as BioIcon,
  ArrowForward as ArrowIcon,
  LocalHospital as LogoIcon,
  CheckCircle as CheckIcon,
  Security as SecurityIcon,
  VerifiedUser as VerifiedIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { InviteTokenInfo, StaffInviteRegisterRequest } from '../types';

const StaffInviteRegistrationPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const { login } = useAuth();

  const [tokenInfo, setTokenInfo] = useState<InviteTokenInfo | null>(null);
  const [tokenError, setTokenError] = useState<string>('');
  const [tokenLoading, setTokenLoading] = useState(true);

  const [formData, setFormData] = useState<StaffInviteRegisterRequest>({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    confirm_password: '',
    title: '',
    specialization: '',
    license_number: '',
    phone: '',
    about: '',
    years_experience: undefined,
  });

  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setTokenError('No invitation token provided.');
        setTokenLoading(false);
        return;
      }
      try {
        const response = await apiClient.validateInviteToken(token);
        setTokenInfo(response.data);
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 410) {
          const detail = err.response?.data?.detail || '';
          if (detail.includes('already been used')) {
            setTokenError('This invitation has already been used to create an account.');
          } else {
            setTokenError('This invitation link has expired. Please ask your admin to send a new invite.');
          }
        } else {
          setTokenError('This invitation link is invalid or not found.');
        }
      } finally {
        setTokenLoading(false);
      }
    };
    validateToken();
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'number'
      ? (e.target.value ? parseInt(e.target.value) : undefined)
      : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.first_name || !formData.last_name || !formData.username) {
      setError('Please fill in all required fields.');
      return;
    }
    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.registerFromInvite(token!, formData);
      await login({ username: formData.username, password: formData.password });
      navigate('/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Registration failed.';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const primaryMain = theme.palette.primary.main;
  const primaryDark = theme.palette.primary.dark;
  const roleDisplay = tokenInfo?.role ? tokenInfo.role.charAt(0).toUpperCase() + tokenInfo.role.slice(1) : '';

  if (tokenLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (tokenError) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: '#f4f6f8' }}>
        <Fade in>
          <Paper elevation={0} sx={{ p: 6, borderRadius: 4, maxWidth: 480, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
            <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Typography variant="h5" fontWeight="700" sx={{ mb: 2 }}>Invitation Invalid</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>{tokenError}</Typography>
            <Button component={RouterLink} to="/" variant="outlined">Back to Login</Button>
          </Paper>
        </Fade>
      </Box>
    );
  }

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
          You're Invited!
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', mb: 3 }}>
          Complete your registration to join {tokenInfo?.hospital_name} on CereSignal.
        </Typography>

        <Box sx={{ mb: 4, p: 2, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 0.5 }}>Joining as</Typography>
          <Typography variant="h6" fontWeight="700">{roleDisplay}</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>at {tokenInfo?.hospital_name}</Typography>
        </Box>

        <List>
          {[
            { icon: <VerifiedIcon />, text: 'Verified invitation' },
            { icon: <HospitalIcon />, text: tokenInfo?.hospital_name || 'Your Hospital' },
            { icon: <SecurityIcon />, text: 'Secure account setup' },
            { icon: <CheckIcon />, text: 'Access immediately after signup' },
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

      {/* Right: form */}
      <Grid
        size={{ xs: 12, md: 8, lg: 9 }}
        sx={{ p: { xs: 2, sm: 4, md: 8 }, display: 'flex', justifyContent: 'center' }}
      >
        <Fade in={true} timeout={600}>
          <Box sx={{ width: '100%', maxWidth: 800 }}>

            <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', mb: 4 }}>
              <LogoIcon sx={{ color: primaryMain, mr: 1, fontSize: 32 }} />
              <Typography variant="h6" fontWeight="800">CereSignal</Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 4 }}>
              <Box>
                <Typography variant="h4" fontWeight="800" sx={{ color: '#1a1a1a', mb: 1 }}>
                  Complete Registration
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Joining <strong>{tokenInfo?.hospital_name}</strong> as a {roleDisplay}.
                </Typography>
              </Box>
              <Chip label={roleDisplay} color="primary" variant="outlined" size="small" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'flex' } }} />
            </Box>

            {/* Pre-filled email (read-only) */}
            <Alert severity="info" sx={{ mb: 4, borderRadius: 2 }}>
              Registering with invited email: <strong>{tokenInfo?.email}</strong>
            </Alert>

            {error && (
              <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>{error}</Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={4}>

                {/* Card 1: Account */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <SecurityIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Account Credentials
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        required fullWidth label="Username" name="username"
                        value={formData.username} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth label="Email" value={tokenInfo?.email || ''} disabled
                        InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }}
                        helperText="Set by your invitation"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        required fullWidth type="password" label="Password" name="password"
                        value={formData.password} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        required fullWidth type="password" label="Confirm Password" name="confirm_password"
                        value={formData.confirm_password} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                {/* Card 2: Personal */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <BadgeIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Personal Details
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, sm: 2 }}>
                      <TextField
                        fullWidth label="Title" name="title" placeholder="Dr."
                        value={formData.title} onChange={handleChange}
                        disabled={isLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        required fullWidth label="First Name" name="first_name"
                        value={formData.first_name} onChange={handleChange}
                        disabled={isLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 5 }}>
                      <TextField
                        required fullWidth label="Last Name" name="last_name"
                        value={formData.last_name} onChange={handleChange}
                        disabled={isLoading}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth label="Phone Number" name="phone"
                        value={formData.phone} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                {/* Card 3: Professional */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                    <HospitalIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Professional Profile
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth label="License Number" name="license_number"
                        value={formData.license_number} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><BadgeIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth label="Specialization" name="specialization"
                        value={formData.specialization} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><SpecializationIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth type="number" label="Years Experience" name="years_experience"
                        value={formData.years_experience ?? ''} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start"><ExperienceIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth multiline rows={3} label="Professional Bio" name="about"
                        placeholder="Tell us about your background..."
                        value={formData.about} onChange={handleChange}
                        disabled={isLoading}
                        InputProps={{ startAdornment: <InputAdornment position="start" sx={{ mt: 1.5 }}><BioIcon color="action" /></InputAdornment> }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

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
                    {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Complete Registration'}
                  </Button>
                </Box>

                <Box sx={{ textAlign: 'center', pb: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Already have an account?{' '}
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

export default StaffInviteRegistrationPage;
