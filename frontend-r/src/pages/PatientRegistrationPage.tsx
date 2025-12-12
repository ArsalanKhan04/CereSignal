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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { PatientRegisterRequest } from '../types';

const PatientRegistrationPage: React.FC = () => {
  const [formData, setFormData] = useState<PatientRegisterRequest>({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
    name: '',
    phone: '',
    date_of_birth: '',
    gender: undefined,
    medical_id: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    blood_type: undefined,
    allergies: '',
    medical_conditions: '',
    current_medications: '',
  });
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { registerPatient } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSelectChange = (e: any) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value === '' ? undefined : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.username || !formData.email || !formData.password || !formData.confirm_password || !formData.name) {
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
      await registerPatient(formData);
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
              Patient Registration
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontSize: '0.875rem',
                textAlign: 'center',
              }}
            >
              Create your patient account
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
              <TextField
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

            {/* Personal Information Section */}
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
              Personal Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4 }}>
              <TextField
                required
                fullWidth
                id="name"
                label="Full Name"
                name="name"
                autoComplete="name"
                value={formData.name}
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
                    id="date_of_birth"
                    label="Date of Birth"
                    name="date_of_birth"
                    type="date"
                    InputLabelProps={{
                      shrink: true,
                    }}
                    value={formData.date_of_birth}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
              </Grid>
              <Grid container spacing={2.5}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel id="gender-label">Gender</InputLabel>
                    <Select
                      labelId="gender-label"
                      id="gender"
                      name="gender"
                      value={formData.gender || ''}
                      label="Gender"
                      onChange={handleSelectChange}
                      disabled={isLoading}
                    >
                      <MenuItem value="">None</MenuItem>
                      <MenuItem value="M">Male</MenuItem>
                      <MenuItem value="F">Female</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="medical_id"
                    label="Medical ID"
                    name="medical_id"
                    value={formData.medical_id}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
              </Grid>
              <TextField
                fullWidth
                id="address"
                label="Address"
                name="address"
                multiline
                rows={2}
                value={formData.address}
                onChange={handleChange}
                disabled={isLoading}
              />
            </Box>

            <Divider sx={{ my: 4 }} />

            {/* Emergency Contact Section */}
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
              Emergency Contact
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4 }}>
              <Grid container spacing={2.5}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="emergency_contact_name"
                    label="Emergency Contact Name"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    id="emergency_contact_phone"
                    label="Emergency Contact Phone"
                    name="emergency_contact_phone"
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 4 }} />

            {/* Medical Information Section */}
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
              Medical Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mb: 4 }}>
              <FormControl fullWidth>
                <InputLabel id="blood-type-label">Blood Type</InputLabel>
                <Select
                  labelId="blood-type-label"
                  id="blood_type"
                  name="blood_type"
                  value={formData.blood_type || ''}
                  label="Blood Type"
                  onChange={handleSelectChange}
                  disabled={isLoading}
                >
                  <MenuItem value="">None</MenuItem>
                  <MenuItem value="A+">A+</MenuItem>
                  <MenuItem value="A-">A-</MenuItem>
                  <MenuItem value="B+">B+</MenuItem>
                  <MenuItem value="B-">B-</MenuItem>
                  <MenuItem value="AB+">AB+</MenuItem>
                  <MenuItem value="AB-">AB-</MenuItem>
                  <MenuItem value="O+">O+</MenuItem>
                  <MenuItem value="O-">O-</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                id="allergies"
                label="Allergies"
                name="allergies"
                multiline
                rows={2}
                placeholder="List any known allergies"
                value={formData.allergies}
                onChange={handleChange}
                disabled={isLoading}
              />
              <TextField
                fullWidth
                id="medical_conditions"
                label="Medical Conditions"
                name="medical_conditions"
                multiline
                rows={2}
                placeholder="List any existing medical conditions"
                value={formData.medical_conditions}
                onChange={handleChange}
                disabled={isLoading}
              />
              <TextField
                fullWidth
                id="current_medications"
                label="Current Medications"
                name="current_medications"
                multiline
                rows={2}
                placeholder="List current medications"
                value={formData.current_medications}
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

export default PatientRegistrationPage;
