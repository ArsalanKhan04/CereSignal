import React, { useState, useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  Tabs,
  Tab,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Fade,
  useTheme,
  Avatar,
  Chip,
  IconButton,
  Paper,
  Grid,
  Divider,
  Stack,
  Tooltip
} from '@mui/material';
import {
  People as PeopleIcon,
  CloudUpload as UploadIcon,
  Add as AddIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  LocalHospital as LogoIcon,
  Close as CloseIcon,
  Search as SearchIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { PatientCreate, User, Patient } from '../types';
import Patients from '../components/Patients';
import FileUpload from '../components/FileUpload';

// --- Components ---

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tech-tabpanel-${index}`}
      aria-labelledby={`tech-tab-${index}`}
      {...other}
      style={{ width: '100%' }}
    >
      {value === index && (
        <Fade in={true} timeout={600}>
          <Box>{children}</Box>
        </Fade>
      )}
    </div>
  );
}

const TechnicianDashboard: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const { user, logout } = useAuth();
  const theme = useTheme();
  
  // Data States
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  
  // Dialog States
  const [openDialog, setOpenDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  
  // Form State
  const initialFormState: PatientCreate & { doctor_id?: number } = {
    name: '', email: '', phone: '', medical_id: '', gender: 'M',
    date_of_birth: '', address: '', emergency_contact_name: '',
    emergency_contact_phone: '', blood_type: 'A+', allergies: '',
    medical_conditions: '', current_medications: '', notes: '',
    doctor_id: undefined,
  };
  const [formData, setFormData] = useState(initialFormState);

  // --- Effects ---
  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [patientsRes, doctorsRes] = await Promise.all([
          apiClient.getPatients(),
          apiClient.getDoctors()
        ]);
        if (patientsRes.status === 200) setPatients(patientsRes.data);
        if (doctorsRes.status === 200) setDoctors(doctorsRes.data);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  // --- Handlers ---
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => setTabValue(newValue);

  const handleOpenDialog = () => {
    setFormData(initialFormState);
    setError('');
    setSuccess('');
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    if (!submitting) setOpenDialog(false);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name) return setError('Patient name is required');
    if (!formData.doctor_id) return setError('Please assign a doctor');

    setSubmitting(true);
    try {
      const response = await apiClient.createPatient(formData);
      if (response.status === 201) {
        setSuccess('Patient registered successfully!');
        const updatedPatients = await apiClient.getPatients();
        setPatients(updatedPatients.data);
        setTimeout(handleCloseDialog, 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create patient');
    } finally {
      setSubmitting(false);
    }
  };

  const technicianName = user?.first_name ? `${user.first_name} ${user.last_name}` : 'Technician';

  // --- Custom Colors ---
  const primaryColor = theme.palette.primary.main;
  const cardBg = '#ffffff';

  return (
    <Box sx={{ flexGrow: 1, bgcolor: '#f0f2f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* --- Top Navbar --- */}
      <AppBar 
        position="sticky" 
        elevation={0} 
        sx={{ 
          bgcolor: 'rgba(255, 255, 255, 0.9)', 
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          color: 'text.primary'
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ height: 70 }}>
            {/* Logo */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 6 }}>
              <LogoIcon sx={{ color: primaryColor, fontSize: 32, mr: 1.5 }} />
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.5px', color: '#1a1a1a' }}>
                Cere<Box component="span" sx={{ color: primaryColor }}>Signal</Box>
              </Typography>
            </Box>

            {/* Navigation */}
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange} 
              sx={{ flexGrow: 1, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '1rem', minHeight: 70 } }}
              textColor="primary"
              indicatorColor="primary"
            >
              <Tab icon={<PeopleIcon sx={{ mb: 0, mr: 1 }} />} iconPosition="start" label="Patient Registry" />
              <Tab icon={<UploadIcon sx={{ mb: 0, mr: 1 }} />} iconPosition="start" label="EEG Uploads" />
            </Tabs>

            {/* User Profile */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                avatar={<Avatar sx={{ bgcolor: theme.palette.primary.light, color: theme.palette.primary.main }}>{technicianName[0]}</Avatar>}
                label={technicianName}
                sx={{ 
                  bgcolor: 'transparent', 
                  border: '1px solid', 
                  borderColor: 'divider',
                  fontWeight: 500,
                  height: 40,
                  '& .MuiChip-label': { px: 2 }
                }}
              />
              <Tooltip title="Logout">
                <IconButton onClick={logout} color="default" sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* --- Main Content Area --- */}
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        <Fade in={true}>
          <Paper 
            elevation={0} 
            sx={{ 
              borderRadius: 4, 
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
              minHeight: '80vh',
              boxShadow: '0px 4px 20px rgba(0,0,0,0.02)'
            }}
          >
            {/* Header Area */}
            <Box sx={{ 
              px: 4, 
              py: 3, 
              borderBottom: '1px solid', 
              borderColor: 'divider', 
              bgcolor: '#ffffff',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a1a', mb: 0.5 }}>
                  {tabValue === 0 ? 'Patient Registry' : 'Upload Center'}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {tabValue === 0 
                    ? 'Manage patient records and assignments.' 
                    : 'Select a patient card to upload new EEG data.'}
                </Typography>
              </Box>

              {/*
              {tabValue === 0 && (
                <Button 
                  variant="contained" 
                  size="large"
                  startIcon={<AddIcon />} 
                  onClick={handleOpenDialog}
                  sx={{ 
                    borderRadius: 3, 
                    px: 4, 
                    py: 1, 
                    fontWeight: 600,
                    textTransform: 'none',
                    boxShadow: '0 8px 16px rgba(25, 118, 210, 0.24)'
                  }}
                >
                  New Patient
                </Button>
              )}
              */}
            </Box>

            {/* Tab Content */}
            <Box sx={{ p: 4, bgcolor: '#fcfcfc' }}>
              <TabPanel value={tabValue} index={0}>
                <Patients />
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                {loadingData ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>
                    <CircularProgress size={60} thickness={4} />
                  </Box>
                ) : patients.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 10, px: 4 }}>
                    <Box sx={{ bgcolor: 'action.hover', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
                       <PeopleIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
                    </Box>
                    <Typography variant="h6" color="text.primary">No Patients Found</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Get started by registering a new patient in the Registry tab.
                    </Typography>
                    <Button variant="outlined" onClick={() => setTabValue(0)}>Go to Registry</Button>
                  </Box>
                ) : (
                  <Grid container spacing={3}>
                    {patients.map((patient) => (
                      <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={patient.id}>
                        <Card 
                          elevation={0}
                          sx={{ 
                            height: '100%', 
                            display: 'flex', 
                            flexDirection: 'column',
                            borderRadius: 3,
                            border: '1px solid',
                            borderColor: 'divider',
                            transition: 'all 0.3s ease',
                            cursor: 'default',
                            '&:hover': { 
                              transform: 'translateY(-4px)',
                              boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                              borderColor: primaryColor
                            }
                          }}
                        >
                          <CardContent sx={{ p: 3, flexGrow: 1 }}>
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                              <Avatar 
                                sx={{ 
                                  bgcolor: theme.palette.primary.main, 
                                  width: 48, 
                                  height: 48,
                                  fontSize: '1.2rem',
                                  boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                                }}
                              >
                                {patient.name.charAt(0).toUpperCase()}
                              </Avatar>
                              <Box sx={{ overflow: 'hidden' }}>
                                <Typography variant="h6" noWrap sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                  {patient.name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                                  ID: {patient.medical_id || 'N/A'}
                                </Typography>
                              </Box>
                            </Stack>
                            
                            <Divider sx={{ mb: 3 }} />

                            <FileUpload
                              patientId={patient.id}
                              onUpload={async (file) => {
                                await apiClient.uploadFile(file, patient.id);
                              }}
                            />
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </TabPanel>
            </Box>
          </Paper>
        </Fade>
      </Container>

      {/* --- Add Patient Modal --- */}
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog} 
        maxWidth="md" 
        fullWidth
        TransitionComponent={Fade}
        PaperProps={{ 
          sx: { 
            borderRadius: 3,
            boxShadow: '0 24px 48px rgba(0,0,0,0.2)'
          } 
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: '1px solid', 
          borderColor: 'divider',
          p: 3
        }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Register New Patient</Typography>
          <IconButton onClick={handleCloseDialog} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ p: 4 }}>
            {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{success}</Alert>}

            <Box sx={{ mb: 4 }}>
              <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
                Personal Details
              </Typography>
              <Grid container spacing={3} sx={{ mt: 0 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth required label="Full Name" name="name" variant="outlined" value={formData.name} onChange={handleFormChange} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth label="Medical ID" name="medical_id" variant="outlined" value={formData.medical_id} onChange={handleFormChange} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth label="Date of Birth" type="date" name="date_of_birth" variant="outlined" value={formData.date_of_birth} onChange={handleFormChange} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Gender</InputLabel>
                    <Select name="gender" value={formData.gender} label="Gender" onChange={handleFormChange}>
                      <MenuItem value="M">Male</MenuItem>
                      <MenuItem value="F">Female</MenuItem>
                      <MenuItem value="O">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box>
              <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
                Medical Assignment
              </Typography>
              <Grid container spacing={3} sx={{ mt: 0 }}>
                 <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth required>
                    <InputLabel>Assign Doctor</InputLabel>
                    <Select name="doctor_id" value={formData.doctor_id || ''} label="Assign Doctor" onChange={handleFormChange}>
                      {doctors.map((doc) => (
                        <MenuItem key={doc.id} value={doc.id}>
                          Dr. {doc.first_name} {doc.last_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                   <TextField fullWidth multiline rows={3} label="Initial Clinical Notes" name="notes" variant="outlined" value={formData.notes} onChange={handleFormChange} placeholder="Enter any important initial observations..." />
                </Grid>
              </Grid>
            </Box>

          </DialogContent>
          
          <DialogActions sx={{ p: 3, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#f8f9fa' }}>
            <Button onClick={handleCloseDialog} color="inherit" sx={{ fontWeight: 600 }}>Cancel</Button>
            <Button 
              type="submit" 
              variant="contained" 
              size="large"
              disabled={submitting}
              sx={{ px: 4, fontWeight: 600, boxShadow: 'none' }}
              startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : null}
            >
              {submitting ? 'Registering...' : 'Register Patient'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default TechnicianDashboard;
