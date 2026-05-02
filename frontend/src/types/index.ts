// Authentication types
export type UserType = 'doctor' | 'technician' | 'patient' | 'admin';

export interface User {
  id: number;
  username: string;
  email: string;
  user_type: UserType;
  first_name?: string;
  last_name?: string;
  title?: string;
  specialization?: string;
  license_number?: string;
  phone?: string;
  about?: string;
  hospital_affiliation?: string;
  years_experience?: number;
  profile_picture?: string;
  hospital_id?: number;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface Hospital {
  id: number;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at: string;
}

export interface StaffInvitation {
  id: number;
  hospital_id: number;
  invited_email: string;
  role: 'doctor' | 'technician';
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export interface AdminStats {
  total_patients: number;
  total_doctors: number;
  total_technicians: number;
  pending_reports: number;
  completed_reports: number;
  pending_invitations: number;
}

export interface HospitalAdminRegisterRequest {
  hospital_name: string;
  hospital_address?: string;
  hospital_phone?: string;
  hospital_email?: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface InviteTokenInfo {
  email: string;
  role: 'doctor' | 'technician';
  hospital_name: string;
  hospital_id: number;
}

export interface StaffInviteRegisterRequest {
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  confirm_password: string;
  title?: string;
  specialization?: string;
  license_number?: string;
  phone?: string;
  about?: string;
  years_experience?: number;
}

export interface StaffMember {
  id: number;
  username: string;
  email: string;
  user_type: 'doctor' | 'technician';
  first_name?: string;
  last_name?: string;
  title?: string;
  specialization?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface NotificationItem {
  id: number;
  patient_id?: number | null;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface PatientIdLoginRequest {
  patient_id: number;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  user_type?: UserType;
  first_name?: string;
  last_name?: string;
  title?: string;
  specialization?: string;
  license_number?: string;
  phone?: string;
  about?: string;
  hospital_affiliation?: string;
  years_experience?: number;
}

export interface PatientRegisterRequest {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  name: string;
  phone?: string;
  date_of_birth?: string;
  age?: number;
  gender?: 'M' | 'F' | 'Other';
  medical_id?: string;
  address?: string;
  referred_by?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  medical_conditions?: string;
  current_medications?: string;
  notes?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

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
  referred_by?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  medical_conditions?: string;
  current_medications?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  doctor_name?: string;
  auth_user_id?: number | null;
}

export interface PatientCreate {
  name: string;
  email?: string;
  phone?: string;
  medical_id?: string;
  gender: 'M' | 'F' | 'Other';
  date_of_birth?: string;
  age?: number;
  address?: string;
  referred_by?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  medical_conditions?: string;
  current_medications?: string;
  notes?: string;
  doctor_id?: number; // For technicians to assign patient to a doctor
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
  report_task_id?: string;
  events?: Record<string, any>;
  factual_report?: string;
  impression?: string;
  user_name?: string;
}

export interface EEGBookmark {
  id: number;
  file_id: number;
  comment?: string | null;
  image_url: string;
  created_at: string;
  created_by?: number | null;
}

export interface EEGBookmarkCreate {
  image_base64: string;
  comment?: string;
  replace_id?: number;
}

export interface ReportStatus {
  file_id: number;
  report_status: 'not_started' | 'pending' | 'completed' | 'failed';
  message: string;
  has_report: boolean;
  report?: {
    factual_report: string;
    impression: string;
  };
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
  impression?: string;
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
  impression?: string;
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
  impression?: string;
  doctor_info?: string;
  is_finalized?: boolean;
  pdf_file_path?: string;
}

export interface EEGReportVersion {
  id: number;
  report_id: number;
  version_number: number;
  saved_by_auth_user_id: number;
  saved_at: string;
  saved_by_name?: string;
  patient_name: string;
  patient_age?: number;
  patient_gender?: 'M' | 'F' | 'Other';
  ref_physician?: string;
  indications?: string;
  technique?: string;
  factual_report?: string;
  impression?: string;
  doctor_info?: string;
  is_finalized: boolean;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface ApiError {
  detail: string;
}