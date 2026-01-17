import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
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
  ListItemText,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  Lock as LockIcon,
  CalendarToday as CalendarIcon,
  Home as HomeIcon,
  Bloodtype as BloodIcon,
  Warning as AllergyIcon,
  Medication as MedsIcon,
  Healing as ConditionIcon, 
  ContactPhone as EmergencyIcon,
  Phone as PhoneIcon, 
  ArrowForward as ArrowIcon,
  LocalHospital as LogoIcon,
  HealthAndSafety as HealthIcon,
  History as HistoryIcon,
  Description as ReportIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { PatientRegisterRequest } from '../types';

const PatientRegistrationPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { registerPatient } = useAuth();
  
  const [formData, setFormData] = useState<PatientRegisterRequest>({
    username: '', email: '', password: '', confirm_password: '',
    name: '', phone: '', date_of_birth: '', gender: undefined,
    medical_id: '', address: '', emergency_contact_name: '',
    emergency_contact_phone: '', blood_type: undefined,
    allergies: '', medical_conditions: '', current_medications: '',
  });
  
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (e: any) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value === '' ? undefined : value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.email || !formData.password || !formData.confirm_password || !formData.name) {
      setError('Please fill in all required fields.');
      return;
    }
    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      await registerPatient(formData);
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

  return (
    <Grid container sx={{ minHeight: '100vh', bgcolor: '#f4f6f8' }}>
      
      {/* --- Left Side: Patient Branding (Standard Blue Theme) --- */}
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
          Your Health, Simplified
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', mb: 6 }}>
          Access your neurological data, view reports, and stay connected with your care team.
        </Typography>

        <List>
          {[
            { icon: <HealthIcon />, text: 'Secure Patient Portal' },
            { icon: <ReportIcon />, text: 'Instant Report Access' },
            { icon: <HistoryIcon />, text: 'Medical History Tracking' },
            { icon: <EmergencyIcon />, text: 'Direct Doctor Connection' }
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
            © 2025 NeuroTech Systems Inc.
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
                  Patient Registration
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Create your personal health account.
                </Typography>
              </Box>
              <Chip label="Secure Sign-up" color="primary" variant="outlined" size="small" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'flex' } }} />
            </Box>

            {error && <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>{error}</Alert>}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={4}>
                
                {/* --- Card 1: Login Details --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <LockIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Account Login
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField required fullWidth label="Username" name="username" value={formData.username} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField required fullWidth label="Email Address" name="email" value={formData.email} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField required fullWidth type="password" label="Password" name="password" value={formData.password} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField required fullWidth type="password" label="Confirm Password" name="confirm_password" value={formData.confirm_password} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start"><LockIcon color="action" /></InputAdornment> }} />
                     </Grid>
                   </Grid>
                </Paper>

                {/* --- Card 2: Personal Profile --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <PersonIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Personal Profile
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12 }}>
                        <TextField required fullWidth label="Full Name" name="name" value={formData.name} onChange={handleChange} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth type="date" label="Date of Birth" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} 
                          InputLabelProps={{ shrink: true }} InputProps={{ startAdornment: <InputAdornment position="start"><CalendarIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                       <FormControl fullWidth>
                          <InputLabel>Gender</InputLabel>
                          <Select name="gender" value={formData.gender || ''} label="Gender" onChange={handleSelectChange}>
                            <MenuItem value="M">Male</MenuItem>
                            <MenuItem value="F">Female</MenuItem>
                            <MenuItem value="Other">Other</MenuItem>
                          </Select>
                       </FormControl>
                     </Grid>
                     <Grid size={{ xs: 12 }}>
                        <TextField fullWidth multiline rows={2} label="Address" name="address" value={formData.address} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start" sx={{ mt: 1.5 }}><HomeIcon color="action" /></InputAdornment> }} />
                     </Grid>
                   </Grid>
                </Paper>

                {/* --- Card 3: Medical History --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <LogoIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Medical History
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="Medical ID (Optional)" name="medical_id" value={formData.medical_id} onChange={handleChange} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                       <FormControl fullWidth>
                          <InputLabel>Blood Type</InputLabel>
                          <Select name="blood_type" value={formData.blood_type || ''} label="Blood Type" onChange={handleSelectChange} startAdornment={<InputAdornment position="start" sx={{ml: 1}}><BloodIcon fontSize="small" color="action" /></InputAdornment>}>
                            <MenuItem value="A+">A+</MenuItem><MenuItem value="A-">A-</MenuItem>
                            <MenuItem value="B+">B+</MenuItem><MenuItem value="B-">B-</MenuItem>
                            <MenuItem value="O+">O+</MenuItem><MenuItem value="O-">O-</MenuItem>
                            <MenuItem value="AB+">AB+</MenuItem><MenuItem value="AB-">AB-</MenuItem>
                          </Select>
                       </FormControl>
                     </Grid>
                     <Grid size={{ xs: 12 }}>
                        <TextField fullWidth label="Allergies" name="allergies" value={formData.allergies} onChange={handleChange} placeholder="e.g. Penicillin, Peanuts"
                          InputProps={{ startAdornment: <InputAdornment position="start"><AllergyIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12 }}>
                        <TextField fullWidth label="Medical Conditions" name="medical_conditions" value={formData.medical_conditions} onChange={handleChange} placeholder="e.g. Asthma, Diabetes"
                          InputProps={{ startAdornment: <InputAdornment position="start"><ConditionIcon color="action" /></InputAdornment> }} />
                     </Grid>
                     <Grid size={{ xs: 12 }}>
                        <TextField fullWidth label="Current Medications" name="current_medications" value={formData.current_medications} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start"><MedsIcon color="action" /></InputAdornment> }} />
                     </Grid>
                   </Grid>
                </Paper>

                {/* --- Card 4: Emergency Contact --- */}
                <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
                   <Typography variant="h6" fontWeight="700" sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
                     <EmergencyIcon sx={{ mr: 1.5, color: 'primary.main' }} /> Emergency Contact
                   </Typography>
                   <Grid container spacing={3}>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="Contact Name" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleChange} />
                     </Grid>
                     <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="Contact Phone" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleChange} 
                          InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon color="action" /></InputAdornment> }} />
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
                    boxShadow: '0 8px 24px rgba(25, 118, 210, 0.3)', // Standard Blue Shadow
                    textTransform: 'none',
                    transition: 'all 0.2s',
                    '&:hover': {
                       transform: 'translateY(-2px)',
                       boxShadow: '0 12px 32px rgba(25, 118, 210, 0.4)'
                    }
                  }}
                >
                  {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Patient Account'}
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

export default PatientRegistrationPage;