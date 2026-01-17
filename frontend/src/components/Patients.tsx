import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Upload as UploadIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { User, Patient, PatientCreate, PatientUpdate, SignalFile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import FileUpload from './FileUpload';
import FileList from './FileList';

const Patients: React.FC = () => {
  const { user } = useAuth();
  const isReadOnly = user?.user_type === 'doctor'; // Doctors have read-only access
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [formData, setFormData] = useState<PatientCreate & { doctor_id?: number}>({
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
  const [submitting, setSubmitting] = useState(false);

  // Doctor list (for technicians assigning patients)
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  useEffect(() => {
    loadPatients();
    // Load doctors when technician is viewing so they can assign one on create
    if (user?.user_type === 'technician') {
      loadDoctors();
    }
  }, [user]);

  const loadPatients = async () => {
    try {
      const response = await apiClient.getPatients();
      if (response.status === 200) {
        setPatients(response.data);
      } else {
        setError('Failed to load patients');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading patients';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    setLoadingDoctors(true);
    try {
      const resp = await apiClient.getDoctors();
      if (resp.status === 200) setDoctors(resp.data);
    } catch (e) {
      // ignore errors here
      console.error('Failed to load doctors', e);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const handleOpenDialog = (patient?: Patient) => {
    if (patient) {
      setEditingPatient(patient);
      setFormData({
        name: patient.name,
        email: patient.email || '',
        phone: patient.phone || '',
        medical_id: patient.medical_id || '',
        gender: patient.gender || 'M',
        date_of_birth: patient.date_of_birth || '',
        address: patient.address || '',
        emergency_contact_name: patient.emergency_contact_name || '',
        emergency_contact_phone: patient.emergency_contact_phone || '',
        blood_type: patient.blood_type || 'A+',
        allergies: patient.allergies || '',
        medical_conditions: patient.medical_conditions || '',
        current_medications: patient.current_medications || '',
        notes: patient.notes || '',
        doctor_id: undefined, // leave undefined on edit so it's only sent if changed
      });
    } else {
      setEditingPatient(null);
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
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingPatient(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      medical_id: '',
      gender: 'M',
      notes: '',
    });
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (editingPatient) {
        const updateData: PatientUpdate = {
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          medical_id: formData.medical_id || undefined,
          gender: formData.gender,
          notes: formData.notes || undefined,
        };
        // Include doctor_id only if technician explicitly selected a new doctor
        if (formData.doctor_id !== undefined) {
          (updateData as any).doctor_id = formData.doctor_id;
        }
        await apiClient.updatePatient(editingPatient.id, updateData);
        setSuccess('Patient updated successfully!');
      } else {
        // If a technician is creating a patient, include doctor_id when provided
        if (user?.user_type === 'technician' && !formData.doctor_id) {
          setError('Please assign a doctor to this patient');
          setSubmitting(false);
          return;
        }

        const createData: PatientCreate = {
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          medical_id: formData.medical_id || undefined,
          gender: formData.gender,
          notes: formData.notes || undefined,
          doctor_id: formData.doctor_id || undefined,
        };
        await apiClient.createPatient(createData);
        setSuccess('Patient created successfully!');
      }
      await loadPatients();
      handleCloseDialog();
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to save patient';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (patientId: number) => {
    if (window.confirm('Are you sure you want to delete this patient?')) {
      try {
        const response = await apiClient.deletePatient(patientId);
        if (response.status === 200) {
          setError(''); // Clear any previous errors
          setSuccess('Patient deleted successfully!');
          await loadPatients();
          // Clear success message after 3 seconds
          setTimeout(() => setSuccess(''), 3000);
        } else {
          setError('Failed to delete patient');
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete patient';
        setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }
    }
  };

  const handleFileUpload = async (file: File, patientId: number) => {
    try {
      await apiClient.uploadFile(file, patientId);
      // Refresh patients to show updated file counts
      await loadPatients();
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to upload file';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          {isReadOnly ? 'My Patients' : 'Patient Management'}
        </Typography>
        {!isReadOnly && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Patient
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {patients.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
              No patients found. Add your first patient!
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {patients.map((patient) => (
            <Grid sx={{ xs: 12 }} key={patient.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box>
                      <Typography variant="h6">{patient.name}</Typography>
                      {patient.age && (
                        <Typography variant="body2" color="textSecondary">
                          Age: {patient.age} years
                        </Typography>
                      )}
                      {patient.gender && (
                        <Typography variant="body2" color="textSecondary">
                          Gender: {patient.gender}
                        </Typography>
                      )}
                      {patient.email && (
                        <Typography color="textSecondary">{patient.email}</Typography>
                      )}
                      {patient.medical_id && (
                        <Typography variant="body2" color="textSecondary">
                          ID: {patient.medical_id}
                        </Typography>
                      )}
                      {patient.blood_type && (
                        <Typography variant="body2" color="textSecondary">
                          Blood Type: {patient.blood_type}
                        </Typography>
                      )}
                    </Box>
                    {!isReadOnly && (
                      <Box>
                        <IconButton
                          onClick={() => handleOpenDialog(patient)}
                          color="primary"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDelete(patient.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    )}
                  </Box>

                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>EEG Files</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <FileUpload
                        patientId={patient.id}
                        onUpload={(file) => handleFileUpload(file, patient.id)}
                      />
                      <FileList patientId={patient.id} />
                    </AccordionDetails>
                  </Accordion>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add/Edit Patient Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingPatient ? 'Edit Patient' : 'Add New Patient'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Medical ID"
              value={formData.medical_id}
              onChange={(e) => setFormData({ ...formData, medical_id: e.target.value })}
              margin="normal"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Gender</InputLabel>
              <Select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | 'Other' })}
                label="Gender"
              >
                <MenuItem value="M">Male</MenuItem>
                <MenuItem value="F">Female</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
                    <TextField
              fullWidth
              label="Date of Birth"
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              margin="normal"
              InputLabelProps={{ shrink: true }}
            />

            {/* If technician, allow assigning a doctor when creating patient */}
            {user?.user_type === 'technician' && (
              <FormControl fullWidth margin="normal">
                <InputLabel>Assign Doctor</InputLabel>
                <Select
                  value={formData.doctor_id ?? ''}
                  onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value as number })}
                  label="Assign Doctor"
                  disabled={loadingDoctors}
                >
                  {/* If editing, show current doctor as disabled placeholder */}
                  {editingPatient ? (
                    <MenuItem value="" disabled>
                      Current: {editingPatient.doctor_name || 'Unassigned'}
                    </MenuItem>
                  ) : (
                    <MenuItem value="">-- Select Doctor --</MenuItem>
                  )}
                  {doctors.map((doc) => (
                    <MenuItem key={doc.id} value={doc.id}>
                      {doc.title ? `${doc.title} ` : ''}{doc.first_name} {doc.last_name}{doc.specialization ? ` - ${doc.specialization}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              fullWidth
              label="Address"
              multiline
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Emergency Contact Name"
              value={formData.emergency_contact_name}
              onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Emergency Contact Phone"
              value={formData.emergency_contact_phone}
              onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
              margin="normal"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Blood Type</InputLabel>
              <Select
                value={formData.blood_type || 'A+'}
                onChange={(e) => setFormData({ ...formData, blood_type: e.target.value as any })}
                label="Blood Type"
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
            <TextField
              fullWidth
              label="Allergies"
              multiline
              rows={2}
              value={formData.allergies}
              onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Medical Conditions"
              multiline
              rows={2}
              value={formData.medical_conditions}
              onChange={(e) => setFormData({ ...formData, medical_conditions: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Current Medications"
              multiline
              rows={2}
              value={formData.current_medications}
              onChange={(e) => setFormData({ ...formData, current_medications: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Notes"
              multiline
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : (editingPatient ? 'Update' : 'Add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Patients;
