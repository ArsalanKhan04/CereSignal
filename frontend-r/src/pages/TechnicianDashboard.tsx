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
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { PatientCreate, User, Patient } from '../types';
import Patients from '../components/Patients';
import FileUpload from '../components/FileUpload';

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
      id={`technician-tabpanel-${index}`}
      aria-labelledby={`technician-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const TechnicianDashboard: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const { user, logout } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [formData, setFormData] = useState<PatientCreate & { doctor_id?: number }>({
    name: '',
    email: '',
    phone: '',
    medical_id: '',
    gender: 'M',
    date_of_birth: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    blood_type: 'A+',
    allergies: '',
    medical_conditions: '',
    current_medications: '',
    notes: '',
    doctor_id: undefined,
  });

  useEffect(() => {
    loadDoctors();
    loadPatients();
  }, []);

  const loadPatients = async () => {
    setLoadingPatients(true);
    try {
      const response = await apiClient.getPatients();
      if (response.status === 200) {
        setPatients(response.data);
      }
    } catch (err: any) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadDoctors = async () => {
    setLoadingDoctors(true);
    try {
      const response = await apiClient.getDoctors();
      if (response.status === 200) {
        setDoctors(response.data);
      }
    } catch (err: any) {
      console.error('Failed to load doctors:', err);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const handleOpenDialog = () => {
    setOpenDialog(true);
    setFormData({
      name: '',
      email: '',
      phone: '',
      medical_id: '',
      gender: 'M',
      date_of_birth: '',
      address: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      blood_type: 'A+',
      allergies: '',
      medical_conditions: '',
      current_medications: '',
      notes: '',
      doctor_id: undefined,
    });
    setError('');
    setSuccess('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

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
      [name]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name) {
      setError('Patient name is required');
      return;
    }

    if (!formData.doctor_id) {
      setError('Please assign a doctor to this patient');
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiClient.createPatient(formData);
      if (response.status === 201) {
        setSuccess('Patient created successfully');
        await loadPatients(); // Reload patient list
        setTimeout(() => {
          handleCloseDialog();
        }, 1500);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create patient';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const technicianName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}` 
    : user?.username || 'Technician';

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Technician Patient Management
          </Typography>
          <Typography variant="body1" sx={{ mr: 2 }}>
            Welcome, {technicianName}!
          </Typography>
          <Button color="inherit" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Patient Management
            </Typography>
          </Box>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="technician dashboard tabs">
            <Tab label="Patients" />
            <Tab label="Upload EEG Files" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Patients />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <Box>
            <Typography variant="h6" sx={{ mb: 3 }}>
              Upload EEG Files
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select a patient and upload their EEG files. Files will be linked to the patient and their assigned doctor.
            </Typography>
            {patients.length === 0 ? (
              <Alert severity="info">
                No patients available. Please add a patient first.
              </Alert>
            ) : (
              <Grid container spacing={3}>
                {patients.map((patient) => (
                  <Grid sx={{ xs: 12, sm: 6, md: 4 }} key={patient.id}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>
                          {patient.name}
                        </Typography>
                        {patient.medical_id && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            ID: {patient.medical_id}
                          </Typography>
                        )}
                        <FileUpload
                          patientId={patient.id}
                          onUpload={async (file) => {
                            await apiClient.uploadFile(file, patient.id);
                            // Optionally reload patient list or show success message
                          }}
                        />
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </TabPanel>
      </Container>
    </Box>


  );
};

export default TechnicianDashboard;
