import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Link,
  CircularProgress,
  Grid, // MUI v6 Grid (Grid2)
  InputAdornment,
  Fade,
  useTheme,
  Stack,
  Paper,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import BadgeIcon from '@mui/icons-material/Badge';
import HospitalIcon from '@mui/icons-material/LocalHospital';
import ExperienceIcon from '@mui/icons-material/WorkHistory';
import SpecializationIcon from '@mui/icons-material/MedicalServices';
import PhoneIcon from '@mui/icons-material/Phone';
import BioIcon from '@mui/icons-material/Description';
import ArrowIcon from '@mui/icons-material/ArrowForward';
import LogoIcon from '@mui/icons-material/LocalHospital';
import TechIcon from '@mui/icons-material/Engineering';
import UploadIcon from '@mui/icons-material/CloudUpload';
import DeviceIcon from '@mui/icons-material/Devices';
import SpeedIcon from '@mui/icons-material/Speed';
import FormAlert from '../components/FormAlert';
import FormTextField from '../components/FormTextField';
import {
  validateUsername, validateEmail, validatePassword, validateConfirmPassword,
  validateName, validatePhone, validateYearsExperience, validateMaxLength,
  collectErrors, extractApiErrors,
} from '../utils/validation';
import { useAuth } from '../contexts/AuthContext';
import { RegisterRequest } from '../types';

const TechnicianRegistrationPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { register } = useAuth();
  
  const [formData, setFormData] = useState<RegisterRequest>({
    username: '', email: '', password: '', confirm_password: '',
    user_type: 'technician', first_name: '', last_name: '',
    title: '', specialization: '', license_number: '',
    phone: '', about: '', hospital_affiliation: '', years_experience: 0,
  });
  
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type } = e.target;
    const value = type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
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
      validateUsername(formData.username),
      validateEmail(formData.email),
      validatePassword(formData.password),
      validateConfirmPassword(formData.password, formData.confirm_password),
      validateName(formData.first_name, 'first_name', 'First name'),
      validateName(formData.last_name, 'last_name', 'Last name'),
      validatePhone(formData.phone),
      validateYearsExperience(formData.years_experience?.toString()),
      validateMaxLength(formData.title, 'title', 'Title', 50),
      validateMaxLength(formData.specialization, 'specialization', 'Specialization', 100),
      validateMaxLength(formData.license_number, 'license_number', 'License number', 50),
      validateMaxLength(formData.hospital_affiliation, 'hospital_affiliation', 'Hospital affiliation', 200),
      validateMaxLength(formData.about, 'about', 'Bio', 500),
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
      // blank phone must be sent as absent, not "": the schema's pattern rejects ""
      await register({ ...formData, phone: formData.phone || undefined });
      setSuccess('Registration successful! Redirecting...');
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
      
      {/* --- Left Side: Tech Branding (Standardized Blue Theme) --- */}
      <Grid 
        size={{ xs: 0, md: 4, lg: 3 }}
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          bgcolor: '#0a1929',
          background: `linear-gradient(180deg, ${primaryDark} 0%, #0a1929 100%)`, // Consistent Blue Gradient
          color: 'white',
          p: 6,
          position: 'sticky',
          top: 0,
          height: '100vh',
          borderRight: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 8 }}>
          <LogoIcon sx={{ fontSize: 40, mr: 2, color: 'white' }} />
          <Typography variant="h5" fontWeight="800">CereSignal</Typography>
        </Box>

        <Typography variant="h4" fontWeight="700" sx={{ mb: 2 }}>
          Streamline Your Workflow
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', mb: 6 }}>
          Manage patient data, upload high-res EEG files, and collaborate with specialists instantly.
        </Typography>

        <List>
          {[
            { icon: <DeviceIcon />, text: 'Device Integration' },
            { icon: <UploadIcon />, text: 'High-Speed Uploads' },
            { icon: <TechIcon />, text: 'Lab Management Tools' },
            { icon: <SpeedIcon />, text: 'Real-Time Processing' }
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

      {/* --- Right Side: Form --- */}
      <Grid 
        size={{ xs: 12, md: 8, lg: 9 }}
        sx={{ 
          p: { xs: 2, sm: 4, md: 8 },
          display: 'flex',
          justifyContent: 'center'
        }}
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
                  Technician Registration
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Join the network as a certified technician.
                </Typography>
              </Box>
              <Chip label="Lab Access" color="primary" variant="outlined" size="small" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'flex' } }} />
            </Box>

            <FormAlert error={error} success={success} onDismiss={() => { setError(''); setSuccess(''); }} autoHideMs={3000} />

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={4}>
                
                {/* --- Card 1: Account --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <LockIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Account Credentials
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12, sm: 6 }}>
                         <FormTextField required fullWidth label="Username" name="username" value={formData.username} onChange={handleChange}
                           fieldError={fieldErrors.username}
                           InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                         <FormTextField required fullWidth label="Email Address" name="email" value={formData.email} onChange={handleChange}
                           fieldError={fieldErrors.email}
                           InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                         <FormTextField required fullWidth type="password" label="Password" name="password" value={formData.password} onChange={handleChange}
                           fieldError={fieldErrors.password}
                           InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                         <FormTextField required fullWidth type="password" label="Confirm Password" name="confirm_password" value={formData.confirm_password} onChange={handleChange}
                           fieldError={fieldErrors.confirm_password}
                           InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }} />
                     </Grid>
                   </Grid>
                </Paper>

                {/* --- Card 2: Personal --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <BadgeIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Personal Information
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12, sm: 2 }}>
                         <FormTextField fullWidth label="Title" name="title" placeholder="Tech" value={formData.title} onChange={handleChange}
                           fieldError={fieldErrors.title} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 5 }}>
                         <FormTextField required fullWidth label="First Name" name="first_name" value={formData.first_name} onChange={handleChange}
                           fieldError={fieldErrors.first_name} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 5 }}>
                         <FormTextField required fullWidth label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange}
                           fieldError={fieldErrors.last_name} />
                     </Grid>
                     <Grid size={{ xs: 12 }}>
                         <FormTextField fullWidth label="Phone Number" name="phone" value={formData.phone} onChange={handleChange}
                           fieldError={fieldErrors.phone}
                           InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon color="action" /></InputAdornment> }} />
                     </Grid>
                   </Grid>
                </Paper>

                {/* --- Card 3: Professional --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <TechIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Professional Profile
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12, sm: 6 }}>
                         <FormTextField fullWidth label="Certification ID" name="license_number" value={formData.license_number} onChange={handleChange}
                           fieldError={fieldErrors.license_number}
                           InputProps={{ startAdornment: <InputAdornment position="start"><BadgeIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                         <FormTextField fullWidth label="Lab Specialization" name="specialization" value={formData.specialization} onChange={handleChange}
                           fieldError={fieldErrors.specialization}
                           InputProps={{ startAdornment: <InputAdornment position="start"><SpecializationIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 8 }}>
                         <FormTextField fullWidth label="Hospital/Lab Affiliation" name="hospital_affiliation" value={formData.hospital_affiliation} onChange={handleChange}
                           fieldError={fieldErrors.hospital_affiliation}
                           InputProps={{ startAdornment: <InputAdornment position="start"><HospitalIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 4 }}>
                         <FormTextField fullWidth type="number" label="Years Experience" name="years_experience" value={formData.years_experience} onChange={handleChange}
                           fieldError={fieldErrors.years_experience}
                           InputProps={{ startAdornment: <InputAdornment position="start"><ExperienceIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12 }}>
                         <FormTextField fullWidth multiline rows={3} label="Professional Bio" name="about" placeholder="Describe your technical background..." value={formData.about} onChange={handleChange}
                           fieldError={fieldErrors.about}
                           InputProps={{ startAdornment: <InputAdornment position="start" sx={{ mt: 1.5 }}><BioIcon color="action" /></InputAdornment> }} />
                     </Grid>
                   </Grid>
                </Paper>

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
                    boxShadow: '0 8px 24px rgba(25, 118, 210, 0.3)', // Standard Blue shadow
                    textTransform: 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                       transform: 'translateY(-2px)',
                       boxShadow: '0 12px 32px rgba(25, 118, 210, 0.4)'
                    }
                  }}
                >
                  {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Technician Account'}
                </Button>
                
                <Box sx={{ textAlign: 'center', pb: 4 }}>
                   <Typography variant="body2" color="text.secondary">
                     Already a member?{' '}
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

export default TechnicianRegistrationPage;
