import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  CircularProgress,
  Grid,
  Divider,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { RegisterRequest } from '../types';

const TechnicianRegistrationPage: React.FC = () => {
  const [formData, setFormData] = useState<RegisterRequest>({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
    user_type: 'technician',
    first_name: '',
    last_name: '',
    title: '',
    specialization: '',
    license_number: '',
    phone: '',
    about: '',
    hospital_affiliation: '',
    years_experience: 0,
  });
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.username || !formData.email || !formData.password || !formData.confirm_password || 
        !formData.first_name || !formData.last_name) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Registration failed. Please try again.';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        padding: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, sm: 4 },
      }}
    >
      <Container maxWidth="md" sx={{ width: '100%' }}>
        <Paper
          elevation={0}
          sx={{
            padding: { xs: 3, sm: 4, md: 5 },
            width: '100%',
            maxWidth: '700px',
            mx: 'auto',
            border: '1px solid',
            borderColor: 'grey.200',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              mb: 4,
            }}
          >
            <Typography
              component="h1"
              variant="h1"
              sx={{
                fontWeight: 700,
                mb: 1,
                color: 'text.primary',
                fontSize: { xs: '1.75rem', sm: '2rem' },
              }}
            >
              CereSignal
            </Typography>
            <Typography
              component="h2"
              variant="h2"
              sx={{
                mb: 1,
                color: 'text.secondary',
                fontSize: { xs: '1.125rem', sm: '1.25rem' },
                fontWeight: 400,
              }}
            >
              Technician Registration
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '0.875rem',
                textAlign: 'center',
              }}
            >
              Create your professional account
            </Typography>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{
                width: '100%',
                mb: 3,
                borderRadius: 2,
                '& .MuiAlert-message': {
                  fontSize: '0.875rem',
                },
              }}
            >
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            {/* Account Information Section */}
            <Typography
              variant="h4"
              sx={{
                mb: 2.5,
                mt: 1,
                color: 'text.primary',
                fontSize: '1rem',
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              Account Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4 }}>
              <Grid container spacing={2.5}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    required
                    fullWidth
                    id="first_name"
                    label="First Name"
                    name="first_name"
                    autoComplete="given-name"
                    autoFocus
                    value={formData.first_name}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    required
                    fullWidth
                    id="last_name"
                    label="Last Name"
                    name="last_name"
                    autoComplete="family-name"
                    value={formData.last_name}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
              </Grid>
              
              <TextField
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
                disabled={isLoading}
              />
              
              <TextField
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
              />
              
              <Grid container spacing={2.5}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    required
                    fullWidth
                    name="password"
                    label="Password"
                    type="password"
                    id="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    required
                    fullWidth
                    name="confirm_password"
                    label="Confirm Password"
                    type="password"
                    id="confirm_password"
                    autoComplete="new-password"
                    value={formData.confirm_password}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 4 }} />

            {/* Professional Information Section */}
            <Typography
              variant="h4"
              sx={{
                mb: 2.5,
                color: 'text.primary',
                fontSize: '1rem',
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              Professional Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4 }}>
              <Grid container spacing={2.5}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="title"
                    label="Title"
                    name="title"
                    placeholder="EEG Tech, Lab Tech, etc."
                    value={formData.title}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="specialization"
                    label="Specialization/Area"
                    name="specialization"
                    placeholder="EEG, Lab, etc."
                    value={formData.specialization}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
              </Grid>
              
              <TextField
                fullWidth
                id="license_number"
                label="License/Certification Number"
                name="license_number"
                value={formData.license_number}
                onChange={handleChange}
                disabled={isLoading}
              />
              
              <Grid container spacing={2.5}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="phone"
                    label="Phone Number"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="years_experience"
                    label="Years of Experience"
                    name="years_experience"
                    type="number"
                    value={formData.years_experience}
                    onChange={handleChange}
                    disabled={isLoading}
                    inputProps={{ min: 0, max: 100 }}
                  />
                </Grid>
              </Grid>
              
              <TextField
                fullWidth
                id="hospital_affiliation"
                label="Hospital/Clinic Affiliation"
                name="hospital_affiliation"
                value={formData.hospital_affiliation}
                onChange={handleChange}
                disabled={isLoading}
              />
              
              <TextField
                fullWidth
                id="about"
                label="Professional Bio"
                name="about"
                multiline
                rows={3}
                placeholder="Brief description of your professional background"
                value={formData.about}
                onChange={handleChange}
                disabled={isLoading}
              />
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={isLoading}
              sx={{
                mt: 2,
                py: 1.5,
                fontSize: '0.9375rem',
                fontWeight: 600,
              }}
            >
              {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 3 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                Already have an account?{' '}
                <Link
                  component={RouterLink}
                  to="/"
                  sx={{
                    color: 'primary.main',
                    textDecoration: 'none',
                    fontWeight: 500,
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  Sign in
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default TechnicianRegistrationPage;
