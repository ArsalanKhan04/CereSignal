import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Button,
  Typography,
  Link,
  CircularProgress,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { RegisterRequest } from '../types';
import { validateUsername, validateEmail, validatePassword, validateConfirmPassword, validateName, validateYearsExperience, collectErrors, extractApiErrors } from '../utils/validation';
import FormAlert from '../components/FormAlert';
import FormTextField from '../components/FormTextField';

const SignupPage: React.FC = () => {
  const [formData, setFormData] = useState<RegisterRequest>({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
    user_type: 'doctor',
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
  const [success, setSuccess] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleDismiss = () => {
    setError('');
    setSuccess('');
    setFieldErrors({});
  };

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
    setFieldErrors({});
    setSuccess('');

    const errors = collectErrors(
      validateUsername(formData.username),
      validateEmail(formData.email),
      validatePassword(formData.password),
      validateConfirmPassword(formData.password, formData.confirm_password),
      validateName(formData.first_name, 'first_name', 'First name', 100),
      validateName(formData.last_name, 'last_name', 'Last name', 100),
      validateYearsExperience(String(formData.years_experience)),
    );
    if (errors.length > 0) {
      const fieldErrMap: Record<string, string> = {};
      errors.forEach(e => { fieldErrMap[e.field] = e.message; });
      setFieldErrors(fieldErrMap);
      return;
    }

    setIsLoading(true);

    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err: any) {
      const responseData = err.response?.data;
      const { general, fields } = extractApiErrors(responseData?.errors ?? responseData?.detail);
      if (fields.length > 0) {
        const fieldErrMap: Record<string, string> = {};
        fields.forEach((f: any) => { fieldErrMap[f.field] = f.message; });
        setFieldErrors(fieldErrMap);
      }
      setError(general || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Typography component="h1" variant="h3" sx={{ fontWeight: 'bold', mb: 2 }}>
              CereSignal
            </Typography>
            <Typography component="h2" variant="h5" sx={{ mb: 4, color: 'text.secondary' }}>
              Doctor Registration
            </Typography>

            <FormAlert error={error} success={success} onDismiss={handleDismiss} />

            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <Grid container spacing={2}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                <FormTextField
                    margin="normal"
                    required
                    id="first_name"
                    label="First Name"
                    name="first_name"
                    autoComplete="given-name"
                    autoFocus
                    value={formData.first_name}
                    onChange={handleChange}
                    disabled={isLoading}
                    fieldError={fieldErrors.first_name}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                <FormTextField
                    margin="normal"
                    required
                    id="last_name"
                    label="Last Name"
                    name="last_name"
                    autoComplete="family-name"
                    value={formData.last_name}
                    onChange={handleChange}
                    disabled={isLoading}
                    fieldError={fieldErrors.last_name}
                  />
                </Grid>
              </Grid>
              
              <FormTextField
                margin="normal"
                required
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.username}
              />
              <FormTextField
                margin="normal"
                required
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.email}
              />
              
              <Grid container spacing={2}>
                <Grid sx={{ xs: 12, sm: 6 }}>
                <FormTextField
                    margin="normal"
                    id="title"
                    label="Title (Dr., Prof., etc.)"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    disabled={isLoading}
                    fieldError={fieldErrors.title}
                  />
                </Grid>
                <Grid sx={{ xs: 12, sm: 6 }}>
                <FormTextField
                    margin="normal"
                    id="specialization"
                    label="Specialization"
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleChange}
                    disabled={isLoading}
                    fieldError={fieldErrors.specialization}
                  />
                </Grid>
              </Grid>
              
              <FormTextField
                margin="normal"
                id="license_number"
                label="License Number"
                name="license_number"
                value={formData.license_number}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.license_number}
              />
              
              <FormTextField
                margin="normal"
                id="phone"
                label="Phone Number"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.phone}
              />
              
              <FormTextField
                margin="normal"
                id="hospital_affiliation"
                label="Hospital/Affiliation"
                name="hospital_affiliation"
                value={formData.hospital_affiliation}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.hospital_affiliation}
              />
              
              <FormTextField
                margin="normal"
                id="years_experience"
                label="Years of Experience"
                name="years_experience"
                type="number"
                value={formData.years_experience}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.years_experience}
                inputProps={{ min: 0, max: 100 }}
              />
              
              <FormTextField
                margin="normal"
                id="about"
                label="About (Professional Bio)"
                name="about"
                multiline
                rows={3}
                value={formData.about}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.about}
              />
              
              <FormTextField
                margin="normal"
                required
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.password}
              />
              <FormTextField
                margin="normal"
                required
                name="confirm_password"
                label="Confirm Password"
                type="password"
                id="confirm_password"
                autoComplete="new-password"
                value={formData.confirm_password}
                onChange={handleChange}
                disabled={isLoading}
                fieldError={fieldErrors.confirm_password}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2, py: 1.5 }}
                disabled={isLoading}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Register'}
              </Button>
              <Box sx={{ textAlign: 'center' }}>
                <Link component={RouterLink} to="/" variant="body2">
                  Already have an account? Sign In
                </Link>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default SignupPage;
