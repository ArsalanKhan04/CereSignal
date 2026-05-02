import React, { useState, useEffect, useRef } from 'react';
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
  Divider,
  Stack,
  AppBar,
  Toolbar,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  Description as ReportIcon,
  InsertDriveFile as FileIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  History as HistoryIcon,
  MarkEmailRead as MarkSentIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { pdfNameFromEdf } from '../utils/fileNames';
import { User, Patient, PatientCreate, PatientUpdate, SignalFile, EventsData, EEGReport } from '../types';
import { useAuth } from '../contexts/AuthContext';
import EEGPlot from './EEGPlot';
import TopographicMap from './TopographicMap';
import ReportForm from './ReportForm';
import ReportVersionHistory from './ReportVersionHistory';


const Patients: React.FC<{
  doctorViewMode?: 'assigned' | 'all';
  initialStatusFilter?: 'pending' | 'examined' | 'all';
  statusFilter?: 'pending' | 'examined' | 'all';
  onStatusFilterChange?: (value: 'pending' | 'examined' | 'all') => void;
  showStatusToggle?: boolean;
  showDoctorViewToggle?: boolean;
  onDoctorViewModeChange?: (value: 'assigned' | 'all') => void;
  selectedPatientId?: number | null;
  onPatientDetailsClose?: () => void;
  reportSentFilter?: boolean;
}> = ({
  doctorViewMode = 'assigned',
  initialStatusFilter = 'all',
  statusFilter,
  onStatusFilterChange,
  showStatusToggle = true,
  showDoctorViewToggle = false,
  onDoctorViewModeChange,
  selectedPatientId,
  onPatientDetailsClose,
  reportSentFilter,
}) => {
  const { user } = useAuth();
  const isReadOnly = user?.user_type === 'doctor';
  const allowDoctorFileOps = false;
  const allowDesktopCreate = false;
  const allowLabelChange = user?.user_type === 'doctor';
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientFiles, setPatientFiles] = useState<Record<number, SignalFile[]>>({});
  const [patientReports, setPatientReports] = useState<Record<number, EEGReport[]>>({});
  const [activeEEGFileId, setActiveEEGFileId] = useState<number | null>(null);
  const [activeTopomapFileId, setActiveTopomapFileId] = useState<number | null>(null);
  const [activeReportContext, setActiveReportContext] = useState<{
    patient: Patient;
    file: SignalFile;
    report?: EEGReport | null;
  } | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [labelSubmittingId, setLabelSubmittingId] = useState<number | null>(null);
  const [activeEEGEvents, setActiveEEGEvents] = useState<EventsData | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Record<number, { condition: string; inference_status: string }>>({});
  const [localStatusFilter, setLocalStatusFilter] = useState<'pending' | 'examined' | 'all'>(initialStatusFilter);
  const [detailPatient, setDetailPatient] = useState<Patient | null>(null);
  const [detailPatientLoading, setDetailPatientLoading] = useState(false);
  const [historyReport, setHistoryReport] = useState<EEGReport | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const pollingRef = useRef<number | null>(null);

  const activeStatusFilter = statusFilter ?? localStatusFilter;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchTimeoutRef = useRef<number | null>(null);

  // Doctor list (for technicians assigning patients)
  const [doctors, setDoctors] = useState<User[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  useEffect(() => {
    loadPatients();
    // Load doctors when technician or desktop doctor is viewing so they can assign one on create
    if (user?.user_type === 'technician' || allowDesktopCreate) {
      loadDoctors();
    }
  }, [user, doctorViewMode, searchQuery, reportSentFilter]);

  useEffect(() => {
    if (!selectedPatientId) return;
    handleOpenPatientDetails(selectedPatientId);
  }, [selectedPatientId]);

  useEffect(() => () => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }
  }, []);


  useEffect(() => {
    setLocalStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    const activeFiles = Object.values(patientFiles)
      .flat()
      .filter((file) => file.processing_status === 'processing' || file.condition === 'processing');

    if (activeFiles.length === 0) {
      return undefined;
    }

    pollingRef.current = window.setInterval(async () => {
      await Promise.all(
        activeFiles.map(async (file) => {
          const statusResponse = await apiClient.checkInferenceStatus(file.id);
          setFileStatuses((prev) => ({
            ...prev,
            [file.id]: {
              condition: statusResponse.data.condition,
              inference_status: statusResponse.data.inference_status,
            },
          }));
        })
      );
      await loadPatients();
    }, 10000);

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [patientFiles]);

  const loadPatients = async () => {
    try {
      const response = await apiClient.getPatients(isReadOnly && doctorViewMode === 'all', searchQuery.trim() || undefined, 0, 200, reportSentFilter);
      if (response.status === 200) {
        const filteredPatients = isReadOnly && doctorViewMode === 'assigned'
          ? response.data.filter((patient) => patient.auth_user_id === user?.id)
          : response.data;
        const uniquePatients = Array.from(new Map(filteredPatients.map((patient) => [patient.id, patient])).values());
        setPatients(uniquePatients);
        const fileRequests = uniquePatients.map((patient) => apiClient.getFiles(patient.id));
        const reportRequests = (isReadOnly || user?.user_type === 'technician')
          ? uniquePatients.map((patient) => apiClient.getReportsForPatient(patient.id))
          : [];
        const [fileResponses, reportResponses] = await Promise.all([
          Promise.all(fileRequests),
          Promise.all(reportRequests),
        ]);
        const filesMap = uniquePatients.reduce((acc, patient, index) => {
          acc[patient.id] = fileResponses[index]?.data || [];
          return acc;
        }, {} as Record<number, SignalFile[]>);
        setPatientFiles(filesMap);

        if (isReadOnly || user?.user_type === 'technician') {
          const reportsMap = uniquePatients.reduce((acc, patient, index) => {
            acc[patient.id] = reportResponses[index]?.data || [];
            return acc;
          }, {} as Record<number, EEGReport[]>);
          setPatientReports(reportsMap);
        }

        const statusRequests = fileResponses
          .flatMap((resp) => resp.data)
          .filter((file) => file.processing_status === 'processing' || file.condition === 'processing')
          .map((file) => apiClient.checkInferenceStatus(file.id));
        if (statusRequests.length > 0) {
          const statusResponses = await Promise.all(statusRequests);
          setFileStatuses((prev) =>
            statusResponses.reduce((acc, status) => {
              acc[status.data.file_id] = {
                condition: status.data.condition,
                inference_status: status.data.inference_status,
              };
              return acc;
            }, { ...prev } as Record<number, { condition: string; inference_status: string }>)
          );
        }
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
    if (allowDesktopCreate && !openDialog) {
      handleOpenDialog();
    }
  };

  const handleDesktopCreate = () => {
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
    setEditingPatient(null);
    setSelectedFile(null);
    setFileError('');
    setOpenDialog(true);
  };

  const handleOpenDialog = (patient?: Patient) => {
    if (patient) {
      setEditingPatient(patient);
      setDetailPatientLoading(true);
      apiClient.getPatient(patient.id)
        .then((response) => {
          if (response.status === 200) {
            const fullPatient = response.data;
            setFormData({
              name: fullPatient.name,
              email: fullPatient.email || '',
              phone: fullPatient.phone || '',
              medical_id: fullPatient.medical_id || '',
              gender: fullPatient.gender || 'M',
              date_of_birth: fullPatient.date_of_birth || '',
              address: fullPatient.address || '',
              emergency_contact_name: fullPatient.emergency_contact_name || '',
              emergency_contact_phone: fullPatient.emergency_contact_phone || '',
              blood_type: fullPatient.blood_type || 'A+',
              allergies: fullPatient.allergies || '',
              medical_conditions: fullPatient.medical_conditions || '',
              current_medications: fullPatient.current_medications || '',
              notes: fullPatient.notes || '',
              referred_by: fullPatient.referred_by || '',
              doctor_id: undefined, // leave undefined on edit so it's only sent if changed
              age: fullPatient.age,
            });
          }
        })
        .catch(() => {
          setError('Failed to load patient details');
        })
        .finally(() => {
          setDetailPatientLoading(false);
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
          const uploadResponse = await apiClient.uploadFile(selectedFile, createdPatient.data.id, { skipInference: allowDesktopCreate });
          if (uploadResponse.data.message === 'Matlab Script automatically applied') {
            setSuccess('Matlab Script automatically applied');
          } else {
            setSuccess('Patient created successfully!');
          }
        } else {
          setSuccess('Patient created successfully!');
        }
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
        const errorMessage = err && typeof err === 'object'
          ? ((err as any).response?.data?.detail || (err as any).message)
          : undefined;
        setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to delete patient');
      }
    }
  };

  const handleFilePreview = async (patientId: number) => {
    const file = patientFiles[patientId]?.[0];
    if (!file) return;

    try {
      const eventsResponse = await apiClient.getFileEvents(file.id);
      if (eventsResponse.status === 200) {
        setActiveEEGEvents(eventsResponse.data);
      } else {
        setActiveEEGEvents(null);
      }
    } catch (err) {
      setActiveEEGEvents(null);
    }

    setActiveEEGFileId(file.id);
  };

  const handleOpenPatientDetails = async (patientId: number) => {
    setDetailPatientLoading(true);
    try {
      const response = await apiClient.getPatient(patientId);
      if (response.status === 200) {
        setDetailPatient(response.data);
      }
    } catch (err) {
      setError('Failed to load patient details');
    } finally {
      setDetailPatientLoading(false);
    }
  };

  const handleClosePatientDetails = () => {
    setDetailPatient(null);
    if (onPatientDetailsClose) {
      onPatientDetailsClose();
    }
  };

  const handleCreateReport = (patient: Patient) => {
    const file = patientFiles[patient.id]?.[0];
    if (!file) return;
    const existingReport = patientReports[patient.id]?.find((report) => report.file_id === file.id) || null;
    setActiveReportContext({ patient, file, report: existingReport });
  };

  const handleEditReport = (patient: Patient, report: EEGReport) => {
    const file = patientFiles[patient.id]?.[0];
    if (!file) return;
    setActiveReportContext({ patient, file, report });
  };

  const handleReportSaved = async (report: EEGReport) => {
    setReportSubmitting(true);
    try {
      await apiClient.generateReportPDF(report.id);
      setSuccess('Report saved and PDF generated.');
      await loadPatients();
      setActiveReportContext(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const errorMessage = err && typeof err === 'object'
        ? ((err as any).response?.data?.detail || (err as any).message)
        : undefined;
      setError(typeof errorMessage === 'string' ? errorMessage : 'Failed to generate PDF');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleDownloadReport = async (reportId: number, fileName?: string) => {
    try {
      const blob = await apiClient.downloadReportPDF(reportId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfNameFromEdf(fileName, `EEG_Report_${reportId}`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      setError('Error downloading report PDF');
    }
  };


  const maxBirthDate = new Date().toISOString().split('T')[0];
  const activeEEGFile = activeEEGFileId
    ? Object.values(patientFiles).flat().find((file) => file.id === activeEEGFileId) || null
    : null;

  const getReportStatusColor = (impression?: string) => {
    if (impression === 'normal' || impression === 'abnormal') return 'success';
    return 'default';
  };

  const getPatientFile = (patient: Patient) => patientFiles[patient.id]?.[0] || null;

  const getPatientReport = (patient: Patient, file: SignalFile | null) =>
    patientReports[patient.id]?.find((item) => item.file_id === file?.id) || null;

  const detailFile = detailPatient ? getPatientFile(detailPatient) : null;
  const detailReport = detailPatient ? getPatientReport(detailPatient, detailFile) : null;
  const detailHasPdf = Boolean(detailReport?.pdf_file_path);

  const shouldShowPatient = (report: EEGReport | null, file: SignalFile | null) => {
    const fileLabel = file?.condition?.toLowerCase();
    const hasLabel = fileLabel === 'normal' || fileLabel === 'abnormal' || Boolean(report?.impression);
    const hasReportAndLabel = Boolean(report) && hasLabel;
    if (activeStatusFilter === 'all') return true;
    if (activeStatusFilter === 'examined') return hasReportAndLabel;
    return !hasReportAndLabel;
  };

  const filteredPatients = patients.filter((patient) => {
    if (!allowDesktopCreate) {
      if (isReadOnly && doctorViewMode === 'assigned' && patient.auth_user_id !== user?.id) {
        return false;
      }
    }
    const file = getPatientFile(patient);
    const report = getPatientReport(patient, file);
    return shouldShowPatient(report, file);
  });

  const handleAssignLabel = async (patient: Patient, file: SignalFile, label: 'normal' | 'abnormal') => {
    setLabelSubmittingId(file.id);
    setError('');
    setSuccess('');
    try {
      const response = await apiClient.updateFileLabel(file.id, label);
      const updatedFile = response.data;
      setPatientFiles((prev) => ({
        ...prev,
        [patient.id]: (prev[patient.id] || []).map((item) =>
          item.id === file.id
            ? { ...item, condition: updatedFile.condition, processing_status: updatedFile.processing_status }
            : item
        ),
      }));
      setPatientReports((prev) => {
        const reports = prev[patient.id] || [];
        const reportIndex = reports.findIndex((item) => item.file_id === file.id);
        if (reportIndex === -1) return prev;
        const updatedReports = reports.map((item, index) =>
          index === reportIndex ? { ...item, impression: label } : item
        );
        return { ...prev, [patient.id]: updatedReports };
      });
      setFileStatuses((prev) => ({
        ...prev,
        [file.id]: {
          condition: updatedFile.condition,
          inference_status: prev[file.id]?.inference_status || 'completed',
        },
      }));
      await loadPatients();
    } catch (err) {
      setError('Failed to assign label');
    } finally {
      setLabelSubmittingId(null);
    }
  };

  const handleMarkReportSent = async (patientId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setActionLoadingId(patientId);
    try {
      await apiClient.markReportSent(patientId);
      await loadPatients();
      setSuccess('Report marked as sent');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to mark report as sent');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendPortalEmail = async (patientId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setActionLoadingId(patientId);
    try {
      await apiClient.sendPortalEmail(patientId);
      await loadPatients();
      setSuccess('Portal email sent to patient');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send portal email');
    } finally {
      setActionLoadingId(null);
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
    <>
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {!isReadOnly && (
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Patient Registry
            </Typography>
          )}
            <TextField
              size="small"
              label="Search patients"
              value={searchInput}
              onChange={(event) => {
                const value = event.target.value;
                setSearchInput(value);
                if (searchTimeoutRef.current) {
                  window.clearTimeout(searchTimeoutRef.current);
                }
                searchTimeoutRef.current = window.setTimeout(() => {
                  setSearchQuery(value.trim());
                }, 350);
              }}
              sx={{ width: 240 }}
            />
            {!isReadOnly && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Add Patient
              </Button>
            )}
            {allowDesktopCreate && (
              <Button
                variant="contained"
                startIcon={<UploadIcon />}
                onClick={handleDesktopCreate}
              >
                Add Patient
              </Button>
            )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto', flexWrap: 'wrap' }}>
          {showStatusToggle && (isReadOnly || user?.user_type === 'technician') && (
            <ToggleButtonGroup
              value={activeStatusFilter}
              exclusive
              onChange={(_event, value) => {
                if (!value) return;
                if (onStatusFilterChange) {
                  onStatusFilterChange(value);
                } else {
                  setLocalStatusFilter(value);
                }
              }}
              size="small"
            >
              <ToggleButton value="pending">Pending Review</ToggleButton>
              <ToggleButton value="examined">Examined</ToggleButton>
              <ToggleButton value="all">All</ToggleButton>
            </ToggleButtonGroup>
          )}
          {showDoctorViewToggle && onDoctorViewModeChange && (
            <ToggleButtonGroup
              value={doctorViewMode}
              exclusive
              onChange={(_event, value) => value && onDoctorViewModeChange(value)}
              size="small"
            >
              <ToggleButton value="assigned">Assigned to me</ToggleButton>
              <ToggleButton value="all">All patients</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {filteredPatients.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
              {isReadOnly
                ? activeStatusFilter === 'examined'
                  ? 'No Reviewed Patients'
                  : activeStatusFilter === 'pending'
                    ? 'No Unreviewed Patients'
                    : ''
                : 'No patients found. Add your first patient!'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {filteredPatients.map((patient) => {
            const file = getPatientFile(patient);
            const report = getPatientReport(patient, file);
                    const hasPdf = Boolean(report?.pdf_file_path);
            const normalizedCondition = file?.condition?.toLowerCase();
            const hasLabel = normalizedCondition === 'normal' || normalizedCondition === 'abnormal' || Boolean(report?.impression);
            const hasReportAndLabel = Boolean(report) && hasLabel;
            const reportStatusLabel = hasReportAndLabel ? 'Examined' : 'Pending Review';
            const statusColor = 'default';
            const isNewPatient = Boolean(
              isReadOnly &&
              activeStatusFilter === 'pending' &&
              user?.last_login &&
              patient.created_at &&
              new Date(patient.created_at) > new Date(user.last_login)
            );
            return (
              <Paper
                key={patient.id}
                variant="outlined"
                onClick={() => handleOpenPatientDetails(patient.id)}
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  borderColor: patient.auth_user_id === user?.id ? 'primary.main' : 'divider',
                  bgcolor: patient.auth_user_id === user?.id ? 'primary.50' : 'background.paper',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0px 4px 14px rgba(15, 23, 42, 0.08)'
                  },
                }}
              >
                {isNewPatient && (
                  <Chip
                    label="New"
                    size="small"
                    color="error"
                    sx={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      fontWeight: 600,
                      height: 20,
                    }}
                  />
                )}
                <Box sx={{ minWidth: 200, flexGrow: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: patient.auth_user_id === user?.id ? 700 : 600 }}>
                    {patient.name}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                    {patient.age !== undefined && (
                      <Chip label={`Age ${patient.age}`} size="small" />
                    )}
                    {patient.gender && (
                      <Chip label={`Gender ${patient.gender}`} size="small" />
                    )}
                    {patient.blood_type && (
                      <Chip label={`Blood ${patient.blood_type}`} size="small" />
                    )}
                    {patient.medical_id && (
                      <Chip label={`ID ${patient.medical_id}`} size="small" variant="outlined" />
                    )}
                    {user?.user_type === 'technician' && (
                      <Chip label={`Patient ID ${patient.id}`} size="small" variant="outlined" />
                    )}
                    {patient.referred_by && (
                      <Chip label={`Referred by: ${patient.referred_by}`} size="small" variant="outlined" />
                    )}
                    {patient.created_at && (
                      <Chip
                        label={`Added ${new Date(patient.created_at).toLocaleDateString()}`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {user?.user_type === 'technician' && (
                      <Chip
                        label={patient.doctor_name ? `Assigned: ${patient.doctor_name}` : 'Assigned: Unassigned'}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Box>

                <Box sx={{ minWidth: 220 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {file ? (
                      (() => {
                          if (allowDesktopCreate) {
                           const assignedImpression = report?.impression?.toLowerCase();
                           const assignedCondition = file.condition?.toLowerCase();
                           const effectiveLabel = (assignedCondition === 'normal' || assignedCondition === 'abnormal'
                             ? assignedCondition
                             : assignedImpression === 'normal' || assignedImpression === 'abnormal'
                               ? assignedImpression
                               : undefined);
                            const label = !report && !effectiveLabel
                              ? 'No Report'
                              : effectiveLabel === 'normal'
                                ? 'Normal'
                                : effectiveLabel === 'abnormal'
                                  ? 'Abnormal'
                                  : 'Unassigned';
                           const color = effectiveLabel === 'normal'
                             ? 'success'
                             : effectiveLabel === 'abnormal'
                               ? 'error'
                               : 'default';
                          return (
                            <Chip
                              label={label}
                              size="small"
                              color={color as any}
                            />
                          );
                        }
                        const status = fileStatuses[file.id];
                        const condition = status?.condition || file.condition;
                        const normalizedCondition = condition === 'processing' ? 'processing' : condition;
                        return (
                          <Chip
                            label={normalizedCondition === 'normal'
                              ? 'Normal'
                              : normalizedCondition === 'abnormal'
                                ? 'Abnormal'
                                : normalizedCondition === 'failed'
                                  ? 'Failed'
                                  : 'Processing'}
                            size="small"
                            color={normalizedCondition === 'normal'
                              ? 'success'
                              : normalizedCondition === 'abnormal'
                                ? 'error'
                                : normalizedCondition === 'failed'
                                  ? 'warning'
                                  : 'info'}
                          />
                        );
                      })()
                    ) : (
                      <Chip label="No EEG" size="small" variant="outlined" />
                    )}
                    {(isReadOnly || user?.user_type === 'technician') && (
                      <Chip
                        label={reportStatusLabel}
                        size="small"
                        variant={report ? 'filled' : 'outlined'}
                        color={statusColor as any}
                      />
                    )}
                  </Stack>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', flexWrap: 'wrap' }}>
                  {!isReadOnly && (
                    <IconButton
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenDialog(patient);
                      }}
                      color="primary"
                      size="small"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                  {!isReadOnly && (
                    <IconButton
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(patient.id);
                      }}
                      color="error"
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                  {allowDoctorFileOps && file && (
                    <IconButton
                      color="error"
                      size="small"
                      onClick={async (event) => {
                        event.stopPropagation();
                        if (!file) return;
                        if (!window.confirm('Are you sure you want to delete this EEG file?')) return;
                        try {
                          await apiClient.deleteFile(file.id);
                          await apiClient.deletePatient(patient.id);
                          setSuccess('EEG file and patient deleted successfully');
                          await loadPatients();
                          setTimeout(() => setSuccess(''), 3000);
                        } catch (err) {
                          setError('Failed to delete EEG file');
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                  {allowLabelChange && file && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAssignLabel(patient, file, 'normal');
                        }}
                        disabled={labelSubmittingId === file.id}
                        color={(file.condition || '').toLowerCase() === 'normal' ? 'success' : 'primary'}
                        sx={{ minWidth: 80, height: 28, fontSize: '0.75rem', px: 1 }}
                      >
                        Normal
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAssignLabel(patient, file, 'abnormal');
                        }}
                        disabled={labelSubmittingId === file.id}
                        sx={{ minWidth: 90, height: 28, fontSize: '0.75rem', px: 1, borderWidth: (file.condition || '').toLowerCase() === 'abnormal' ? 2 : 1 }}
                      >
                        Abnormal
                      </Button>
                    </Stack>
                  )}
                  {isReadOnly && (
                    <Button
                      variant={report ? 'outlined' : 'contained'}
                      size="small"
                      startIcon={report ? <EditIcon fontSize="small" /> : <ReportIcon fontSize="small" />}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (report) {
                          handleEditReport(patient, report);
                        } else {
                          handleCreateReport(patient);
                        }
                      }}
                      disabled={!file}
                      sx={{ minWidth: 108, height: 28, fontSize: '0.75rem', px: 1 }}
                    >
                      {report ? 'Edit Report' : 'Create Report'}
                    </Button>
                  )}
                  {(isReadOnly || user?.user_type === 'technician') && report && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon fontSize="small" />}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDownloadReport(report.id, file?.original_filename || report.file_name);
                      }}
                      disabled={!hasPdf}
                      sx={{ minWidth: 140, height: 28, fontSize: '0.75rem', px: 1 }}
                    >
                      Download Report
                    </Button>
                  )}
                  {user?.user_type === 'technician' && hasReportAndLabel && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<MarkSentIcon fontSize="small" />}
                      onClick={(event) => handleMarkReportSent(patient.id, event)}
                      disabled={actionLoadingId === patient.id || patient.report_sent}
                      sx={{ minWidth: 130, height: 28, fontSize: '0.75rem', px: 1 }}
                    >
                      {patient.report_sent ? 'Sent' : 'Report Sent'}
                    </Button>
                  )}
                  {user?.user_type === 'technician' && hasReportAndLabel && (
                    <Tooltip title={!patient.email ? 'Patient email is unavailable' : ''}>
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<EmailIcon fontSize="small" />}
                          onClick={(event) => handleSendPortalEmail(patient.id, event)}
                          disabled={!patient.email || actionLoadingId === patient.id}
                          sx={{ minWidth: 130, height: 28, fontSize: '0.75rem', px: 1 }}
                        >
                          Email Report
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FileIcon fontSize="small" />}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleFilePreview(patient.id);
                    }}
                    disabled={!file}
                    sx={{ minWidth: 86, height: 28, fontSize: '0.75rem', px: 1 }}
                  >
                    View EEG
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog fullScreen open={Boolean(activeEEGFileId)} onClose={() => {
        setActiveEEGFileId(null);
        setActiveEEGEvents(null);
      }}>

        <AppBar sx={{ position: 'relative' }} color="default" elevation={0}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {activeEEGFile?.user_name ? `${activeEEGFile.user_name} EEG` : 'EEG Viewer'}
            </Typography>
            <IconButton edge="end" color="inherit" onClick={() => { setActiveEEGFileId(null); setActiveEEGEvents(null); }}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 2, bgcolor: '#f7f8fa', minHeight: '100%' }}>
          {activeEEGFileId && (
            <EEGPlot fileId={activeEEGFileId} eventsData={activeEEGEvents} />
          )}
        </Box>
      </Dialog>

      <Dialog fullScreen open={Boolean(activeTopomapFileId)} onClose={() => setActiveTopomapFileId(null)}>
        <AppBar sx={{ position: 'relative' }} color="default" elevation={0}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Topographic Map
            </Typography>
            <IconButton edge="end" color="inherit" onClick={() => setActiveTopomapFileId(null)}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 2, bgcolor: '#f7f8fa', minHeight: '100%' }}>
          {activeTopomapFileId && (
            <TopographicMap fileId={activeTopomapFileId} />
          )}
        </Box>
      </Dialog>

      <Dialog fullScreen open={Boolean(detailPatient)} onClose={handleClosePatientDetails}>
        <AppBar sx={{ position: 'relative' }} color="default" elevation={0}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {detailPatient?.name || 'Patient Details'}
              </Typography>
              {detailPatient?.created_at && (
                <Typography variant="caption" color="textSecondary">
                  Added {new Date(detailPatient.created_at).toLocaleString()}
                </Typography>
              )}
            </Box>
            <IconButton edge="end" color="inherit" onClick={handleClosePatientDetails}>
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 3, bgcolor: '#f7f8fa', minHeight: '100%' }}>
          {detailPatientLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
              <CircularProgress />
            </Box>
          ) : detailPatient ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Paper sx={{ p: 3 }} variant="outlined">
                <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={2}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {detailPatient.name}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                      {detailPatient.age !== undefined && <Chip label={`Age ${detailPatient.age}`} size="small" />}
                      {detailPatient.gender && <Chip label={`Gender ${detailPatient.gender}`} size="small" />}
                      {detailPatient.blood_type && <Chip label={`Blood ${detailPatient.blood_type}`} size="small" />}
                      {detailPatient.medical_id && <Chip label={`ID ${detailPatient.medical_id}`} size="small" variant="outlined" />}
                      {user?.user_type === 'technician' && (
                        <Chip label={`Patient ID ${detailPatient.id}`} size="small" variant="outlined" />
                      )}
                      {detailPatient.referred_by && (
                        <Chip label={`Referred by: ${detailPatient.referred_by}`} size="small" variant="outlined" />
                      )}
                      {detailPatient.doctor_name && (
                        <Chip label={`Assigned: ${detailPatient.doctor_name}`} size="small" variant="outlined" />
                      )}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {detailFile ? (
                      <Chip label={detailFile.original_filename} size="small" variant="outlined" />
                    ) : (
                      <Chip label="No EEG" size="small" variant="outlined" />
                    )}
                    {(() => {
                      const detailCondition = detailFile?.condition?.toLowerCase();
                      const detailHasLabel = detailCondition === 'normal' || detailCondition === 'abnormal' || Boolean(detailReport?.impression);
                      const detailHasReportAndLabel = Boolean(detailReport) && detailHasLabel;
                      if (!detailHasReportAndLabel) return null;
                      return (
                        <Chip
                          label="Examined"
                          size="small"
                          color="default"
                        />
                      );
                    })()}
                  </Stack>
                </Box>
              </Paper>

              <Paper sx={{ p: 3 }} variant="outlined">
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Patient Details
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="caption" color="textSecondary">Email</Typography>
                    <Typography variant="body2">{detailPatient.email || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="caption" color="textSecondary">Phone</Typography>
                    <Typography variant="body2">{detailPatient.phone || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="caption" color="textSecondary">DOB</Typography>
                    <Typography variant="body2">{detailPatient.date_of_birth ? new Date(detailPatient.date_of_birth).toLocaleDateString() : '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" color="textSecondary">Address</Typography>
                    <Typography variant="body2">{detailPatient.address || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" color="textSecondary">Emergency Contact</Typography>
                    <Typography variant="body2">
                      {detailPatient.emergency_contact_name || '—'}
                      {detailPatient.emergency_contact_phone ? ` · ${detailPatient.emergency_contact_phone}` : ''}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" color="textSecondary">Allergies</Typography>
                    <Typography variant="body2">{detailPatient.allergies || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" color="textSecondary">Medical Conditions</Typography>
                    <Typography variant="body2">{detailPatient.medical_conditions || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" color="textSecondary">Current Medications</Typography>
                    <Typography variant="body2">{detailPatient.current_medications || '—'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" color="textSecondary">Notes</Typography>
                    <Typography variant="body2">{detailPatient.notes || '—'}</Typography>
                  </Grid>
                </Grid>
              </Paper>

              <Paper sx={{ p: 3 }} variant="outlined">
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Actions
                </Typography>
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
                  {detailFile && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<FileIcon fontSize="small" />}
                      onClick={() => handleFilePreview(detailPatient.id)}
                    >
                      View EEG
                    </Button>
                  )}
                    {(isReadOnly || allowDoctorFileOps) && detailFile && (
                      <Button
                        variant={detailReport ? 'outlined' : 'contained'}
                        size="small"
                        startIcon={detailReport ? <EditIcon fontSize="small" /> : <ReportIcon fontSize="small" />}
                        onClick={() =>
                          detailReport
                            ? handleEditReport(detailPatient, detailReport)
                            : handleCreateReport(detailPatient)
                        }
                      >
                        {detailReport ? 'Edit Report' : 'Create Report'}
                      </Button>
                    )}
                    {(isReadOnly || allowDoctorFileOps) && detailReport && (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<HistoryIcon fontSize="small" />}
                        onClick={() => setHistoryReport(detailReport)}
                      >
                        Version History
                      </Button>
                    )}
                    {(isReadOnly || user?.user_type === 'technician') && detailReport && (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon fontSize="small" />}
                        onClick={() => handleDownloadReport(detailReport.id, detailFile?.original_filename || detailReport.file_name)}
                        disabled={!detailHasPdf}
                      >
                        Download Report
                      </Button>
                    )}
                    {user?.user_type === 'technician' && detailReport && detailFile && (() => {
                      const label = detailFile?.condition?.toLowerCase();
                      const hasLabel = label === 'normal' || label === 'abnormal' || Boolean(detailReport?.impression);
                      const hasReportAndLabel = Boolean(detailReport) && hasLabel;
                      if (!hasReportAndLabel) return null;
                      return (
                        <>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<MarkSentIcon fontSize="small" />}
                            onClick={() => {
                              handleMarkReportSent(detailPatient.id, { stopPropagation: () => {} } as React.MouseEvent);
                            }}
                            disabled={actionLoadingId === detailPatient.id || detailPatient.report_sent}
                          >
                            {detailPatient.report_sent ? 'Sent' : 'Report Sent'}
                          </Button>
                          <Tooltip title={!detailPatient.email ? 'Patient email is unavailable' : ''}>
                            <span>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<EmailIcon fontSize="small" />}
                                onClick={() => {
                                  handleSendPortalEmail(detailPatient.id, { stopPropagation: () => {} } as React.MouseEvent);
                                }}
                                disabled={!detailPatient.email || actionLoadingId === detailPatient.id}
                              >
                                Email Report
                              </Button>
                            </span>
                          </Tooltip>
                        </>
                      );
                    })()}
                  {allowDoctorFileOps && detailFile && (
                    <IconButton
                      color="error"
                      size="small"
                      onClick={async () => {
                        if (!detailFile || !detailPatient) return;
                        if (!window.confirm('Are you sure you want to delete this EEG file?')) return;
                        try {
                          await apiClient.deleteFile(detailFile.id);
                          await apiClient.deletePatient(detailPatient.id);
                          setSuccess('EEG file and patient deleted successfully');
                          await loadPatients();
                          setActiveEEGFileId(null);
                          setActiveTopomapFileId(null);
                          setDetailPatient(null);
                          setTimeout(() => setSuccess(''), 3000);
                        } catch (err) {
                          setError('Failed to delete EEG file');
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                  {allowLabelChange && detailFile && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleAssignLabel(detailPatient, detailFile, 'normal')}
                        disabled={labelSubmittingId === detailFile.id}
                        color={(detailFile.condition || '').toLowerCase() === 'normal' ? 'success' : 'primary'}
                      >
                        Normal
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => handleAssignLabel(detailPatient, detailFile, 'abnormal')}
                        disabled={labelSubmittingId === detailFile.id}
                        sx={{ borderWidth: (detailFile.condition || '').toLowerCase() === 'abnormal' ? 2 : 1 }}
                      >
                        Abnormal
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Paper>

              {detailReport && (
                <Paper sx={{ p: 3 }} variant="outlined">
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                    Report Details
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="caption" color="textSecondary">Indications</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {detailReport.indications || '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Typography variant="caption" color="textSecondary">Technique</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {detailReport.technique || '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" color="textSecondary">Factual Report</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                        {detailReport.factual_report || '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" color="textSecondary">Impression</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {detailReport.impression ? detailReport.impression.toUpperCase() : '—'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" color="textSecondary">Doctor Notes</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                        {detailReport.doctor_info || '—'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
              )}
            </Box>
          ) : (
            <Typography color="textSecondary">Patient details unavailable.</Typography>
          )}
        </Box>
      </Dialog>

      {activeReportContext && (
        <ReportForm
          fileId={activeReportContext.file.id}
          signalFile={activeReportContext.file}
          patient={activeReportContext.patient}
          existingReport={activeReportContext.report || undefined}
          onSave={handleReportSaved}
          onCancel={() => setActiveReportContext(null)}
          isDialog={true}
        />
      )}

      <Dialog open={reportSubmitting} onClose={() => setReportSubmitting(false)} maxWidth="xs">
        <DialogTitle>Generating PDF</DialogTitle>
        <DialogContent>
          <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress />
            <Typography variant="body2" color="textSecondary">
              Finalizing report and preparing the PDF.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportSubmitting(false)}>Hide</Button>
        </DialogActions>
      </Dialog>

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
            {(!editingPatient || allowDesktopCreate) && (
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

      {historyReport && (
        <ReportVersionHistory
          reportId={historyReport.id}
          reportPatientName={historyReport.patient_name}
          open={Boolean(historyReport)}
          onClose={() => setHistoryReport(null)}
          onRestored={() => {
            setHistoryReport(null);
            loadPatients();
          }}
        />
      )}
    </>
  );
};

export default Patients;
