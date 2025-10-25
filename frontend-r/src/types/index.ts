// Authentication types
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  title?: string;
  specialization?: string;
  license_number?: string;
  phone?: string;
  about?: string;
  hospital_affiliation?: string;
  years_experience?: number;
  profile_picture?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  first_name: string;
  last_name: string;
  title?: string;
  specialization?: string;
  license_number?: string;
  phone?: string;
  about?: string;
  hospital_affiliation?: string;
  years_experience?: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Patient types
export interface Patient {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  medical_id?: string;
  gender: 'M' | 'F' | 'Other';
  date_of_birth?: string;
  age?: number;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  medical_conditions?: string;
  current_medications?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  auth_user_id: number;
}

export interface PatientCreate {
  name: string;
  email?: string;
  phone?: string;
  medical_id?: string;
  gender: 'M' | 'F' | 'Other';
  date_of_birth?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  medical_conditions?: string;
  current_medications?: string;
  notes?: string;
}

export interface PatientUpdate extends Partial<PatientCreate> {}

// Signal file types
export interface SignalFile {
  id: number;
  user_id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  file_type: string;
  processing_status: 'pending' | 'processing' | 'failed';
  condition: 'normal' | 'abnormal' | 'processing' | 'failed';
  processed: boolean;
  upload_time: string;
  task_id?: string;
  events?: Record<string, any>;
  user_name?: string;
}

export interface Signal {
  id: number;
  file_id: number;
  channel_name: string;
  sampling_rate: number;
  duration: number;
  data_points: number;
}

export interface FileUploadResponse {
  message: string;
  file_id: number;
  filename: string;
  file_size: number;
  processing_status: string;
}

// Dashboard types
export interface DashboardStats {
  total_files: number;
  total_patients: number;
  condition_counts: {
    normal: number;
    abnormal: number;
    checking: number;
    failed: number;
  };
  recent_files: Array<{
    id: number;
    filename: string;
    condition: string;
    uploaded_at: string;
    patient_name: string;
  }>;
  file_stats: {
    average_duration: number;
    longest_duration: number;
    shortest_duration: number;
    average_size: number;
    total_size: number;
  };
}

// Events types
export interface EventsData {
  file_id: number;
  filename: string;
  condition: string;
  events: Record<string, Record<string, Array<[number, number]>>>;
}

// Report types
export interface EEGReport {
  id: number;
  file_id: number;
  auth_user_id: number;
  patient_name: string;
  patient_age?: number;
  patient_gender?: 'M' | 'F' | 'Other';
  report_date: string;
  ref_physician?: string;
  indications?: string;
  technique?: string;
  factual_report?: string;
  impression: 'normal' | 'abnormal';
  doctor_info?: string;
  created_at: string;
  updated_at?: string;
  is_finalized: boolean;
  pdf_file_path?: string;
  file_name?: string;
  doctor_name?: string;
}

export interface EEGReportCreate {
  file_id: number;
  patient_name: string;
  patient_age?: number;
  patient_gender?: 'M' | 'F' | 'Other';
  ref_physician?: string;
  indications?: string;
  technique?: string;
  factual_report?: string;
  impression: 'normal' | 'abnormal';
  doctor_info?: string;
  pdf_file_path?: string;
}

export interface EEGReportUpdate {
  patient_name?: string;
  patient_age?: number;
  patient_gender?: 'M' | 'F' | 'Other';
  ref_physician?: string;
  indications?: string;
  technique?: string;
  factual_report?: string;
  impression?: 'normal' | 'abnormal';
  doctor_info?: string;
  is_finalized?: boolean;
  pdf_file_path?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface ApiError {
  detail: string;
}