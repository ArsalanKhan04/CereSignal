import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EEGReport, EEGReportCreate, EEGReportUpdate, SignalFile, User, Patient } from '../types';

interface ReportFormProps {
  fileId?: number;
  signalFile?: SignalFile;
  patient?: Patient;
  doctor?: User;
  onSave?: (report: EEGReport) => void;
  onCancel?: () => void;
  isDialog?: boolean;
}

const ReportForm: React.FC<ReportFormProps> = ({
  fileId,
  signalFile,
  patient,
  doctor,
  onSave,
  onCancel,
  isDialog = false
}) => {
  const [formData, setFormData] = useState<EEGReportCreate>({
    file_id: fileId || 0,
    patient_name: '',
    patient_age: undefined,
    patient_gender: 'M',
    ref_physician: '',
    indications: '',
    technique: '',
    factual_report: '',
    impression: 'normal',
    doctor_info: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [existingReport, setExistingReport] = useState<EEGReport | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (fileId) {
      loadExistingReport();
    }
    prefillFormData();
  }, [fileId, signalFile, patient, doctor]);

  const loadExistingReport = async () => {
    if (!fileId) return;
    
    try {
      setLoading(true);
      const response = await apiClient.getReportByFile(fileId);
      if (response.status === 200 && response.data) {
        setExistingReport(response.data);
        setFormData({
          file_id: response.data.file_id,
          patient_name: response.data.patient_name,
          patient_age: response.data.patient_age,
          patient_gender: response.data.patient_gender || 'M',
          ref_physician: response.data.ref_physician || '',
          indications: response.data.indications || '',
          technique: response.data.technique || '',
          factual_report: response.data.factual_report || '',
          impression: response.data.impression,
          doctor_info: response.data.doctor_info || '',
        });
        setIsEditing(true);
      }
    } catch (err: any) {
      console.error('Error loading existing report:', err);
    } finally {
      setLoading(false);
    }
  };

  const prefillFormData = () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Prefill patient information
    if (patient) {
      setFormData(prev => ({
        ...prev,
        patient_name: patient.name || '',
        patient_age: patient.age,
        patient_gender: patient.gender || 'M',
      }));
    } else if (signalFile?.user_name) {
      setFormData(prev => ({
        ...prev,
        patient_name: signalFile.user_name || '',
      }));
    }

    // Prefill doctor information
    if (doctor) {
      const doctorName = `${doctor.first_name || ''} ${doctor.last_name || ''}`.trim() || doctor.username;
      const doctorTitle = doctor.title ? `${doctor.title} ` : '';
      const doctorSpecialization = doctor.specialization ? ` - ${doctor.specialization}` : '';
      const doctorAffiliation = doctor.hospital_affiliation ? `\n${doctor.hospital_affiliation}` : '';
      
      setFormData(prev => ({
        ...prev,
        doctor_info: `${doctorTitle}${doctorName}${doctorSpecialization}${doctorAffiliation}` || '',
      }));
    }

    // Set impression based on file condition
    if (signalFile?.condition) {
      setFormData(prev => ({
        ...prev,
        impression: signalFile.condition === 'abnormal' ? 'abnormal' : 'normal',
      }));
    }
  };

  const handleChange = (field: keyof EEGReportCreate) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | any
  ) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!formData.file_id) {
      setError('No file selected for report');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      let response;
      if (isEditing && existingReport) {
        // Update existing report
        const updateData: EEGReportUpdate = {
          patient_name: formData.patient_name,
          patient_age: formData.patient_age,
          patient_gender: formData.patient_gender,
          ref_physician: formData.ref_physician,
          indications: formData.indications,
          technique: formData.technique,
          factual_report: formData.factual_report,
          impression: formData.impression,
          doctor_info: formData.doctor_info,
        };
        response = await apiClient.updateReport(existingReport.id, updateData);
      } else {
        // Create new report
        response = await apiClient.createReport(formData);
      }

      if (response.status === 200 || response.status === 201) {
        setSuccess('Report saved successfully!');
        setExistingReport(response.data);
        setIsEditing(true);
        if (onSave) {
          onSave(response.data);
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error saving report';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setSaving(false);
    }
  };

  const formContent = (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      
      <Grid container spacing={3}>
        {/* Patient Information */}
        <Grid sx={{ xs: 12 }}>
          <Typography variant="h6" gutterBottom>
            Patient Information
          </Typography>
        </Grid>
        
        <Grid sx={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label="Patient Name"
            value={formData.patient_name}
            onChange={handleChange('patient_name')}
            required
          />
        </Grid>
        
        <Grid sx={{ xs: 12, sm: 3 }}>
          <TextField
            fullWidth
            label="Age"
            type="number"
            value={formData.patient_age || ''}
            onChange={handleChange('patient_age')}
            inputProps={{ min: 0, max: 150 }}
          />
        </Grid>
        
        <Grid sx={{ xs: 12, sm: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Gender</InputLabel>
            <Select
              value={formData.patient_gender || 'M'}
              onChange={handleChange('patient_gender')}
              label="Gender"
            >
              <MenuItem value="M">Male</MenuItem>
              <MenuItem value="F">Female</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        {/* Report Information */}
        <Grid sx={{ xs: 12 }}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Report Information
          </Typography>
        </Grid>
        
        <Grid sx={{ xs: 12, sm:6 }}>
          <TextField
            fullWidth
            label="Date"
            type="date"
            value={new Date().toISOString().split('T')[0]}
            disabled
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        
        <Grid sx={{ xs: 12, sm:6 }}>
          <TextField
            fullWidth
            label="Ref Physician"
            value={formData.ref_physician}
            onChange={handleChange('ref_physician')}
          />
        </Grid>
        
        <Grid sx={{ xs: 12 }}>
          <TextField
            fullWidth
            label="Indications"
            multiline
            rows={3}
            value={formData.indications}
            onChange={handleChange('indications')}
            placeholder="Clinical indications for the EEG study..."
          />
        </Grid>
        
        <Grid sx={{ xs: 12 }}>
          <TextField
            fullWidth
            label="Technique"
            multiline
            rows={3}
            value={formData.technique}
            onChange={handleChange('technique')}
            placeholder="EEG recording technique and parameters..."
          />
        </Grid>
        
        <Grid sx={{ xs: 12 }}>
          <TextField
            fullWidth
            label="Factual Report"
            multiline
            rows={6}
            value={formData.factual_report}
            onChange={handleChange('factual_report')}
            placeholder="Detailed factual findings from the EEG analysis..."
            required
          />
        </Grid>
        
        <Grid sx={{ xs: 12, sm: 6}}>
          <FormControl fullWidth>
            <InputLabel>Impression</InputLabel>
            <Select
              value={formData.impression}
              onChange={handleChange('impression')}
              label="Impression"
              required
            >
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="abnormal">Abnormal</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        
        <Grid sx={{ xs: 12 }}>
          <TextField
            fullWidth
            label="Doctor Info"
            multiline
            rows={3}
            value={formData.doctor_info}
            onChange={handleChange('doctor_info')}
            placeholder="Doctor name, title, and affiliation..."
          />
        </Grid>
      </Grid>
    </Box>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (isDialog) {
    return (
      <Dialog open={true} onClose={onCancel} maxWidth="md" fullWidth>
        <DialogTitle>
          {isEditing ? 'Edit EEG Report' : 'Create EEG Report'}
          {existingReport && (
            <Chip
              label={existingReport.is_finalized ? 'Finalized' : 'Draft'}
              color={existingReport.is_finalized ? 'success' : 'warning'}
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {formContent}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            disabled={saving}
          >
            {saving ? 'Saving...' : isEditing ? 'Update Report' : 'Save Report'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5">
            {isEditing ? 'Edit EEG Report' : 'Create EEG Report'}
          </Typography>
          {existingReport && (
            <Chip
              label={existingReport.is_finalized ? 'Finalized' : 'Draft'}
              color={existingReport.is_finalized ? 'success' : 'warning'}
            />
          )}
        </Box>
        
        {formContent}
        
        <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
          {onCancel && (
            <Button onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            disabled={saving}
          >
            {saving ? 'Saving...' : isEditing ? 'Update Report' : 'Save Report'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ReportForm;
