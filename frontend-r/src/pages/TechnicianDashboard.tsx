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
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenDialog}
              sx={{ mb: 1 }}
            >
              Add New Patient
            </Button>
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

      {/* Add Patient Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Add New Patient</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}

            <Grid container spacing={2}>
              <Grid sx={{ xs: 12 }}>
                <FormControl fullWidth required>
                  <InputLabel id="doctor-select-label">Assign Doctor *</InputLabel>
                  <Select
                    labelId="doctor-select-label"
                    id="doctor_id"
                    name="doctor_id"
                    value={formData.doctor_id || ''}
                    label="Assign Doctor *"
                    onChange={handleSelectChange}
                    disabled={loadingDoctors || submitting}
                  >
                    {doctors.map((doctor) => (
                      <MenuItem key={doctor.id} value={doctor.id}>
                        {doctor.title ? `${doctor.title} ` : ''}
                        {doctor.first_name} {doctor.last_name}
                        {doctor.specialization ? ` - ${doctor.specialization}` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  required
                  fullWidth
                  id="name"
                  label="Patient Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  id="medical_id"
                  label="Medical ID"
                  name="medical_id"
                  value={formData.medical_id}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  id="email"
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  id="phone"
                  label="Phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  id="date_of_birth"
                  label="Date of Birth"
                  name="date_of_birth"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel id="gender-label">Gender</InputLabel>
                  <Select
                    labelId="gender-label"
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    label="Gender"
                    onChange={handleSelectChange}
                    disabled={submitting}
                  >
                    <MenuItem value="M">Male</MenuItem>
                    <MenuItem value="F">Female</MenuItem>
                    <MenuItem value="Other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid sx={{ xs: 12 }}>
                <TextField
                  fullWidth
                  id="address"
                  label="Address"
                  name="address"
                  multiline
                  rows={2}
                  value={formData.address}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  id="emergency_contact_name"
                  label="Emergency Contact Name"
                  name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  id="emergency_contact_phone"
                  label="Emergency Contact Phone"
                  name="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel id="blood-type-label">Blood Type</InputLabel>
                  <Select
                    labelId="blood-type-label"
                    id="blood_type"
                    name="blood_type"
                    value={formData.blood_type}
                    label="Blood Type"
                    onChange={handleSelectChange}
                    disabled={submitting}
                  >
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
              </Grid>

              <Grid sx={{ xs: 12 }}>
                <TextField
                  fullWidth
                  id="allergies"
                  label="Allergies"
                  name="allergies"
                  multiline
                  rows={2}
                  value={formData.allergies}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12 }}>
                <TextField
                  fullWidth
                  id="medical_conditions"
                  label="Medical Conditions"
                  name="medical_conditions"
                  multiline
                  rows={2}
                  value={formData.medical_conditions}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12 }}>
                <TextField
                  fullWidth
                  id="current_medications"
                  label="Current Medications"
                  name="current_medications"
                  multiline
                  rows={2}
                  value={formData.current_medications}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>

              <Grid sx={{ xs: 12 }}>
                <TextField
                  fullWidth
                  id="notes"
                  label="Notes"
                  name="notes"
                  multiline
                  rows={3}
                  value={formData.notes}
                  onChange={handleChange}
                  disabled={submitting}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? <CircularProgress size={24} /> : 'Create Patient'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default TechnicianDashboard;
