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
  Divider,
  Stack,
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
  const [formData, setFormData] = useState<PatientCreate & { doctor_id?: number; age?: number }>({
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
    referred_by: '',
    doctor_id: undefined,
    age: undefined,
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>('');

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
    } catch (err) {
      const errorMessage = err && typeof err === 'object'
        ? ((err as any).response?.data?.detail || (err as any).message)
        : undefined;
      setError(typeof errorMessage === 'string' ? errorMessage : 'Error loading patients');
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (birthDate: string) => {
    const dateValue = new Date(birthDate);
    if (Number.isNaN(dateValue.getTime())) return undefined;
    const today = new Date();
    if (dateValue > today) return undefined;
    let age = today.getFullYear() - dateValue.getFullYear();
    const monthDiff = today.getMonth() - dateValue.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateValue.getDate())) {
      age -= 1;
    }
    return age;
  };

  const handleDateOfBirthChange = (value: string) => {
    const derivedAge = value ? calculateAge(value) : undefined;
    setFormData((prev) => ({
      ...prev,
      date_of_birth: value,
      age: value ? derivedAge : prev.age,
    }));
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

  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const allowedTypes = ['.edf'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      setFileError('Only EDF files are allowed');
      setSelectedFile(null);
      return;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      setFileError('File size must be less than 100MB');
      setSelectedFile(null);
      return;
    }

    setFileError('');
    setSelectedFile(file);
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
        referred_by: patient.referred_by || '',
        doctor_id: undefined, // leave undefined on edit so it's only sent if changed
        age: patient.age,
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
        referred_by: '',
        doctor_id: undefined,
        age: undefined,
      });
    }
    setOpenDialog(true);
    setSelectedFile(null);
    setFileError('');
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingPatient(null);
    setSelectedFile(null);
    setFileError('');
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
      referred_by: '',
      doctor_id: undefined,
      age: undefined,
    });
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.phone?.trim()) {
      setError('Phone is required');
      return;
    }
    if (!formData.gender) {
      setError('Gender is required');
      return;
    }
    if (formData.date_of_birth) {
      const calculatedAge = calculateAge(formData.date_of_birth);
      if (calculatedAge === undefined) {
        setError('Date of birth cannot be in the future');
        return;
      }
      if (formData.age !== calculatedAge) {
        setError('Age must match the date of birth');
        return;
      }
    }
    if (formData.age === undefined || Number.isNaN(Number(formData.age)) || Number(formData.age) < 0) {
      setError('Age is required');
      return;
    }
    if (formData.age !== undefined && formData.age > 130) {
      setError('Age must be 130 or less');
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
          date_of_birth: formData.date_of_birth || undefined,
          address: formData.address || undefined,
          emergency_contact_name: formData.emergency_contact_name || undefined,
          emergency_contact_phone: formData.emergency_contact_phone || undefined,
          blood_type: formData.blood_type || undefined,
          allergies: formData.allergies || undefined,
          medical_conditions: formData.medical_conditions || undefined,
          current_medications: formData.current_medications || undefined,
          notes: formData.notes || undefined,
          referred_by: formData.referred_by || undefined,
        };
        if (formData.age !== undefined) {
          updateData.age = formData.age;
        }
        // Include doctor_id only if technician explicitly selected a new doctor
        if (formData.doctor_id !== undefined) {
          (updateData as any).doctor_id = formData.doctor_id;
        }
        await apiClient.updatePatient(editingPatient.id, updateData);
        setSuccess('Patient updated successfully!');
      } else {
        const createData: PatientCreate = {
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          medical_id: formData.medical_id || undefined,
          gender: formData.gender,
          date_of_birth: formData.date_of_birth || undefined,
          address: formData.address || undefined,
          emergency_contact_name: formData.emergency_contact_name || undefined,
          emergency_contact_phone: formData.emergency_contact_phone || undefined,
          blood_type: formData.blood_type || undefined,
          allergies: formData.allergies || undefined,
          medical_conditions: formData.medical_conditions || undefined,
          current_medications: formData.current_medications || undefined,
          notes: formData.notes || undefined,
          referred_by: formData.referred_by || undefined,
          doctor_id: formData.doctor_id || undefined,
          age: formData.age,
        };
        const createdPatient = await apiClient.createPatient(createData);
        if (selectedFile) {
          await apiClient.uploadFile(selectedFile, createdPatient.data.id);
        }
        setSuccess('Patient created successfully!');
      }
      await loadPatients();
      handleCloseDialog();
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const errorMessage = err && typeof err === 'object'
        ? ((err as any).response?.data?.detail || (err as any).message)
        : undefined;
      setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to save patient');
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
      } catch (err) {
        const errorMessage = err && typeof err === 'object' ? ((err as any).response?.data?.detail || (err as any).message) : undefined;
        setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to delete patient');
      }
    }
  };

  const handleFileUpload = async (file: File, patientId: number) => {
    try {
      await apiClient.uploadFile(file, patientId);
      // Refresh patients to show updated file counts
      await loadPatients();
    } catch (err) {
      const errorMessage = err && typeof err === 'object' ? ((err as any).response?.data?.detail || (err as any).message) : undefined;
      setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to upload file');
    }
  };

  const maxBirthDate = new Date().toISOString().split('T')[0];

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
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingPatient ? 'Edit Patient' : 'Add New Patient'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Alert severity="info">
              Date of birth is optional. If provided, age will sync to the calculated value.
            </Alert>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            {!editingPatient && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  EEG File
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Button
                      variant="outlined"
                      component="label"
                      startIcon={<UploadIcon />}
                      disabled={submitting}
                      fullWidth
                    >
                      {selectedFile ? `Selected: ${selectedFile.name}` : 'Upload EEG File'}
                      <input
                        type="file"
                        hidden
                        accept=".edf"
                        onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                      />
                    </Button>
                  </Grid>
                  {fileError && (
                    <Grid size={{ xs: 12 }}>
                      <Alert severity="error" onClose={() => setFileError('')}>
                        {fileError}
                      </Alert>
                    </Grid>
                  )}
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="textSecondary">
                      Supported format: EDF files only (max 100MB)
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            )}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Required Details
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Age"
                    type="number"
                    value={formData.age ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    required
                    inputProps={{ min: 0, max: 130 }}
                    disabled={Boolean(formData.date_of_birth)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth required>
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
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Date of Birth"
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => handleDateOfBirthChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: maxBirthDate }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Contact & Assignment
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Medical ID"
                    value={formData.medical_id}
                    onChange={(e) => setFormData({ ...formData, medical_id: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Address"
                    multiline
                    rows={2}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </Grid>
                {user?.user_type === 'technician' && (
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Assign Doctor</InputLabel>
                      <Select
                        value={formData.doctor_id ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({
                            ...formData,
                            doctor_id: typeof value === 'string' && value === '' ? undefined : Number(value),
                          });
                        }}
                        label="Assign Doctor"
                        disabled={loadingDoctors}
                      >
                        {editingPatient ? (
                          <MenuItem value="" disabled>
                            Current: {editingPatient.doctor_name || 'Unassigned'}
                          </MenuItem>
                        ) : (
                          <MenuItem value="">Unassigned</MenuItem>
                        )}
                        {doctors.map((doc) => (
                          <MenuItem key={doc.id} value={doc.id}>
                            {doc.title ? `${doc.title} ` : ''}{doc.first_name} {doc.last_name}{doc.specialization ? ` - ${doc.specialization}` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Referred By"
                    value={formData.referred_by || ''}
                    onChange={(e) => setFormData({ ...formData, referred_by: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Box>


            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Emergency & Medical Details
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Emergency Contact Name"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Emergency Contact Phone"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth>
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
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    fullWidth
                    label="Allergies"
                    multiline
                    rows={2}
                    value={formData.allergies}
                    onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Medical Conditions"
                    multiline
                    rows={2}
                    value={formData.medical_conditions}
                    onChange={(e) => setFormData({ ...formData, medical_conditions: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Current Medications"
                    multiline
                    rows={2}
                    value={formData.current_medications}
                    onChange={(e) => setFormData({ ...formData, current_medications: e.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Notes"
                    multiline
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Box>
          </Stack>
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
