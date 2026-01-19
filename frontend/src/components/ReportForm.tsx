import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Stack,
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  HourglassEmpty as WaitingIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EEGReport, EEGReportCreate, EEGReportUpdate, SignalFile, User, Patient } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface ReportFormProps {
  fileId?: number;
  signalFile?: SignalFile;
  patient?: Patient;
  doctor?: User;
  existingReport?: EEGReport | null;
  onSave?: (report: EEGReport) => void;
  onCancel?: () => void;
  isDialog?: boolean;
}

const ReportForm: React.FC<ReportFormProps> = ({
  fileId,
  signalFile,
  patient,
  doctor,
  existingReport: propExistingReport,
  onSave,
  onCancel,
  isDialog = false
}) => {
  const { user } = useAuth();

  const [formData, setFormData] = useState<EEGReportCreate>({
    file_id: fileId || 0,
    patient_name: '',
    patient_age: undefined,
    patient_gender: 'M',
    ref_physician: '',
    indications: '',
    technique: '',
    factual_report: '',
    impression: '',
    doctor_info: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [existingReport, setExistingReport] = useState<EEGReport | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [waitingForLLM, setWaitingForLLM] = useState(false);
  const [llmProgress, setLlmProgress] = useState(0);
  const pollingIntervalRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);
  const MAX_POLL_ATTEMPTS = 30; // 30 attempts * 2 seconds = 60 seconds max wait

  useEffect(() => {
    const initializeForm = async () => {
      if (propExistingReport) {
        // Editing existing report - no need to check for LLM report
        setExistingReport(propExistingReport);
        setFormData({
          file_id: propExistingReport.file_id,
          patient_name: propExistingReport.patient_name,
          patient_age: propExistingReport.patient_age,
          patient_gender: propExistingReport.patient_gender || 'M',
          ref_physician: propExistingReport.ref_physician || '',
          indications: propExistingReport.indications || '',
          technique: propExistingReport.technique || '',
          // Use LLM-generated data if report fields are empty
          factual_report: propExistingReport.factual_report || signalFile?.factual_report || '',
          impression: propExistingReport.impression || signalFile?.impression || '',
          doctor_info: propExistingReport.doctor_info || '',
        });
        setIsEditing(true);
      } else if (fileId) {
        // First check if existing report exists
        try {
          setLoading(true);
          const response = await apiClient.getReportByFile(fileId);
          if (response.status === 200 && response.data) {
            // Report already exists - edit mode
            setExistingReport(response.data);
            setFormData({
              file_id: response.data.file_id,
              patient_name: response.data.patient_name,
              patient_age: response.data.patient_age,
              patient_gender: response.data.patient_gender || 'M',
              ref_physician: response.data.ref_physician || '',
              indications: response.data.indications || '',
              technique: response.data.technique || '',
              factual_report: response.data.factual_report || signalFile?.factual_report || '',
              impression: response.data.impression || signalFile?.impression || '',
              doctor_info: response.data.doctor_info || '',
            });
            setIsEditing(true);
          } else {
            // No existing report - create new and check for LLM report
            prefillFormData();
            checkForLLMReport();
          }
        } catch (err: any) {
          console.error('Error loading existing report:', err);
          // On error, still prefill and check for LLM report
          prefillFormData();
          checkForLLMReport();
        } finally {
          setLoading(false);
        }
      } else {
        prefillFormData();
      }
    };

    initializeForm();
  }, [fileId, signalFile, patient, doctor, propExistingReport, user]);

  useEffect(() => {
    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const checkForLLMReport = async () => {
    if (!fileId) return;

    try {
      // Check if LLM report is already available
      const reportStatusResponse = await apiClient.checkReportStatus(fileId);
      
      if (reportStatusResponse.data.report_status === 'completed' && reportStatusResponse.data.has_report) {
        // LLM report is ready, update form data immediately
        const report = reportStatusResponse.data.report;
        if (report) {
          setFormData(prev => ({
            ...prev,
            factual_report: report.factual_report || prev.factual_report,
            impression: report.impression || prev.impression,
          }));
          setSuccess('AI-generated report loaded successfully!');
          setTimeout(() => setSuccess(''), 5000);
        }
      } else if (reportStatusResponse.data.report_status === 'pending') {
        // LLM is still generating, start polling
        setWaitingForLLM(true);
        pollCountRef.current = 0;
        startPollingForLLM();
      } else if (reportStatusResponse.data.report_status === 'not_started') {
        // No LLM generation started, just open form normally
        console.log('LLM report generation not started');
      } else if (reportStatusResponse.data.report_status === 'failed') {
        // LLM generation failed, open form anyway
        console.log('LLM report generation failed');
        setError('AI report generation failed. You can still create the report manually.');
      }
    } catch (err: any) {
      console.error('Error checking LLM report status:', err);
      // Silently fail and let user create report manually
    }
  };

  const startPollingForLLM = () => {
    if (pollingIntervalRef.current) {
      window.clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      pollCountRef.current += 1;
      setLlmProgress((pollCountRef.current / MAX_POLL_ATTEMPTS) * 100);

      if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
        // Max polling attempts reached, stop waiting and open form
        stopPollingForLLM();
        setWaitingForLLM(false);
        setError('LLM report generation took too long. You can still create the report manually.');
        return;
      }

      try {
        const reportStatusResponse = await apiClient.checkReportStatus(fileId!);
        
        if (reportStatusResponse.data.report_status === 'completed' && reportStatusResponse.data.has_report) {
          // LLM report is ready
          const report = reportStatusResponse.data.report;
          if (report) {
            setFormData(prev => ({
              ...prev,
              factual_report: report.factual_report || prev.factual_report,
              impression: report.impression || prev.impression,
            }));
          }
          stopPollingForLLM();
          setWaitingForLLM(false);
          setSuccess('AI-generated report loaded successfully!');
          setTimeout(() => setSuccess(''), 5000);
        } else if (reportStatusResponse.data.report_status === 'failed') {
          // LLM generation failed
          stopPollingForLLM();
          setWaitingForLLM(false);
          setError('AI report generation failed. You can still create the report manually.');
        }
      } catch (err: any) {
        console.error('Error polling for LLM report:', err);
        stopPollingForLLM();
        setWaitingForLLM(false);
      }
    }, 2000); // Poll every 2 seconds
  };

  const stopPollingForLLM = () => {
    if (pollingIntervalRef.current) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const prefillFormData = () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Only prefill if we're not editing an existing report
    if (propExistingReport) {
      console.log('Skipping prefill - editing existing report');
      return;
    }
    
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

    // Prefill AI-generated report data if available
    if (signalFile?.factual_report || signalFile?.impression) {
      setFormData(prev => ({
        ...prev,
        factual_report: signalFile.factual_report || '',
        impression: signalFile.impression || '',
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

    // Prefill referring technician / ref_physician with current user's name if the user is a doctor
    if (user && user.user_type === 'doctor') {
      const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
      setFormData(prev => ({
        ...prev,
        ref_physician: userName,
      }));
    }

    // Prefill default indications and technique for new reports
    setFormData(prev => ({
      ...prev,
      indications: prev.indications || 'EEG to investigate a seizure disorder.',
      technique: prev.technique || 'This is a multichannel digital EEG recording using the estimated international 10-20 electrode placement system. EEG started with machine calibration the patient was awake and cooperative during the procedure.',
    }));
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
      
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        {/* Patient Information Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
              Patient Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                fullWidth
                label="Patient Name"
                value={formData.patient_name}
                onChange={handleChange('patient_name')}
                required
                variant="outlined"
              />
              
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Age"
                  type="number"
                  value={formData.patient_age || ''}
                  onChange={handleChange('patient_age')}
                  inputProps={{ min: 0, max: 150 }}
                  variant="outlined"
                  sx={{ width: 120 }}
                />
                
                <FormControl sx={{ minWidth: 120 }}>
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
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Report Information Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
              Report Information
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Date"
                  type="date"
                  value={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    // Allow date editing - you can add validation here if needed
                    if (e.target.value) {
                      // Date is editable now
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                  sx={{ minWidth: 200 }}
                />
                
                <TextField
                  fullWidth
                  label="Ref Physician"
                  value={formData.ref_physician}
                  onChange={handleChange('ref_physician')}
                  variant="outlined"
                  placeholder="Referring physician name"
                />
              </Box>
              
              <TextField
                fullWidth
                label="Indications"
                multiline
                rows={4}
                value={formData.indications}
                onChange={handleChange('indications')}
                placeholder="Clinical indications for the EEG study..."
                variant="outlined"
              />
              
              <TextField
                fullWidth
                label="Technique"
                multiline
                rows={4}
                value={formData.technique}
                onChange={handleChange('technique')}
                placeholder="EEG recording technique and parameters..."
                variant="outlined"
              />
              
              <TextField
                fullWidth
                label="Factual Report"
                multiline
                rows={8}
                value={formData.factual_report}
                onChange={handleChange('factual_report')}
                placeholder="Detailed factual findings from the EEG analysis..."
                required
                variant="outlined"
              />
              
              <TextField
                fullWidth
                label="Impression"
                multiline
                rows={6}
                value={formData.impression}
                onChange={handleChange('impression')}
                placeholder="Clinical impression and interpretation of findings..."
                variant="outlined"
              />
            </Box>
          </CardContent>
        </Card>

        {/* Doctor Information Section */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
              Doctor Information
            </Typography>
            <TextField
              fullWidth
              label="Doctor Info"
              multiline
              rows={4}
              value={formData.doctor_info}
              onChange={handleChange('doctor_info')}
              placeholder="Doctor name, title, specialization, and affiliation..."
              variant="outlined"
            />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  // Show waiting dialog while LLM is generating the report
  if (waitingForLLM) {
    return (
      <Dialog open={true} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <WaitingIcon color="primary" />
            <Typography>Generating AI Report</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Please wait while our AI analyzes the EEG data and generates the report. This may take up to 60 seconds.
            </Typography>
            <Box>
              <LinearProgress variant="determinate" value={llmProgress} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Progress: {Math.round(llmProgress)}%
              </Typography>
            </Box>
            <CircularProgress sx={{ alignSelf: 'center' }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              stopPollingForLLM();
              setWaitingForLLM(false);
            }}
            variant="outlined"
          >
            Skip and Create Manually
          </Button>
        </DialogActions>
      </Dialog>
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