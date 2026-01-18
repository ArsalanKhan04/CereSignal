import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  User,
  LoginRequest,
  RegisterRequest,
  PatientRegisterRequest,
  AuthResponse,
  Patient,
  PatientCreate,
  PatientUpdate,
  SignalFile,
  Signal,
  FileUploadResponse,
  DashboardStats,
  EventsData,
  EEGReport,
  EEGReportCreate,
  EEGReportUpdate,
  ApiResponse,
  ApiError,
  NotificationItem
} from '../types';

class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid, redirect to login
          localStorage.removeItem('auth_token');
          localStorage.removeItem('current_user');
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication methods
  async register(data: RegisterRequest): Promise<ApiResponse<User>> {
    const response = await this.client.post('/auth/register', data);
    return { data: response.data, status: response.status };
  }

  async registerPatient(data: PatientRegisterRequest): Promise<ApiResponse<User>> {
    const response = await this.client.post('/auth/register/patient', data);
    return { data: response.data, status: response.status };
  }

  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await this.client.post('/auth/login', data);
    return { data: response.data, status: response.status };
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    const response = await this.client.get('/auth/me');
    return { data: response.data, status: response.status };
  }

  async getNotifications(): Promise<ApiResponse<NotificationItem[]>> {
    const response = await this.client.get('/notifications/');
    return { data: response.data, status: response.status };
  }

  async markNotificationRead(notificationId: number): Promise<ApiResponse<NotificationItem>> {
    const response = await this.client.post(`/notifications/${notificationId}/read`);
    return { data: response.data, status: response.status };
  }

  async getDoctors(): Promise<ApiResponse<User[]>> {
    const response = await this.client.get('/auth/doctors');
    return { data: response.data, status: response.status };
  }

  // Patient management methods
  async getPatients(
    includeUnassigned?: boolean,
    search?: string,
    skip?: number,
    limit?: number
  ): Promise<ApiResponse<Patient[]>> {
    const params: Record<string, any> = {};
    if (includeUnassigned) params.include_unassigned = true;
    if (search) params.search = search;
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;
    const response = await this.client.get('/users/', { params });
    return { data: response.data, status: response.status };
  }

  async getPatient(id: number): Promise<ApiResponse<Patient>> {
    const response = await this.client.get(`/users/${id}`);
    return { data: response.data, status: response.status };
  }

  async createPatient(data: PatientCreate): Promise<ApiResponse<Patient>> {
    const response = await this.client.post('/users/', data);
    return { data: response.data, status: response.status };
  }

  async updatePatient(id: number, data: PatientUpdate): Promise<ApiResponse<Patient>> {
    const response = await this.client.put(`/users/${id}`, data);
    return { data: response.data, status: response.status };
  }

  async deletePatient(id: number): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.delete(`/users/${id}`);
    return { data: response.data, status: response.status };
  }

  // Signal file methods
  async uploadFile(file: File, patientId?: number): Promise<ApiResponse<FileUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    if (patientId) {
      formData.append('patient_id', patientId.toString());
    }

    const response = await this.client.post('/signals/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return { data: response.data, status: response.status };
  }

  async getFiles(patientId?: number): Promise<ApiResponse<SignalFile[]>> {
    const params = patientId ? { patient_id: patientId } : {};
    const response = await this.client.get('/signals/files', { params });
    return { data: response.data, status: response.status };
  }

  async getFileSignals(fileId: number): Promise<ApiResponse<Signal[]>> {
    const response = await this.client.get(`/signals/files/${fileId}/signals`);
    return { data: response.data, status: response.status };
  }

  async getFileEvents(fileId: number): Promise<ApiResponse<EventsData>> {
    const response = await this.client.get(`/signals/files/${fileId}/events`);
    return { data: response.data, status: response.status };
  }

  async getSignalData(fileId: number, startTime: number = 0, duration: number = 10): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/signals/files/${fileId}/signal-data`, {
      params: { start_time: startTime, duration }
    });
    return { data: response.data, status: response.status };
  }

  async getPlotData(
    fileId: number,
    startTime: number = 0,
    duration: number = 10,
    channels?: string,
    montage?: string
  ): Promise<ApiResponse<any>> {
    const params: any = { start_time: startTime, duration };
    if (channels) params.channels = channels;
    if (montage) params.montage = montage;
    const response = await this.client.get(`/signals/files/${fileId}/plot-data`, { params });
    return { data: response.data, status: response.status };
  }

  async checkInferenceStatus(fileId: number): Promise<ApiResponse<{ file_id: number; condition: string; inference_status: string; message: string; task_id?: string }>> {
    const response = await this.client.get(`/signals/files/${fileId}/inference-status`);
    return { data: response.data, status: response.status };
  }

  async deleteFile(fileId: number): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.delete(`/signals/files/${fileId}`);
    return { data: response.data, status: response.status };
  }

  async getStats(): Promise<ApiResponse<DashboardStats>> {
    const response = await this.client.get('/signals/stats');
    return { data: response.data, status: response.status };
  }

  // Report methods
  async createReport(reportData: EEGReportCreate): Promise<ApiResponse<EEGReport>> {
    const response = await this.client.post('/reports/', reportData);
    return { data: response.data, status: response.status };
  }

  async getReports(): Promise<ApiResponse<EEGReport[]>> {
    const response = await this.client.get('/reports/');
    return { data: response.data, status: response.status };
  }

  async getReport(reportId: number): Promise<ApiResponse<EEGReport>> {
    const response = await this.client.get(`/reports/${reportId}`);
    return { data: response.data, status: response.status };
  }

  async updateReport(reportId: number, reportData: EEGReportUpdate): Promise<ApiResponse<EEGReport>> {
    const response = await this.client.put(`/reports/${reportId}`, reportData);
    return { data: response.data, status: response.status };
  }

  async deleteReport(reportId: number): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.delete(`/reports/${reportId}`);
    return { data: response.data, status: response.status };
  }

  async getReportByFile(fileId: number): Promise<ApiResponse<EEGReport | null>> {
    const response = await this.client.get(`/reports/file/${fileId}`);
    return { data: response.data, status: response.status };
  }

  async getReportsForPatient(patientId: number): Promise<ApiResponse<EEGReport[]>> {
    const response = await this.client.get(`/reports/`, { params: { patient_id: patientId } });
    return { data: response.data, status: response.status };
  }

  // PDF methods
  async generateReportPDF(reportId: number): Promise<ApiResponse<{ message: string; pdf_path: string; report_id: number }>> {
    const response = await this.client.post(`/reports/${reportId}/generate-pdf`);
    return { data: response.data, status: response.status };
  }

  async downloadReportPDF(reportId: number): Promise<Blob> {
    const response = await this.client.get(`/reports/${reportId}/download-pdf`, {
      responseType: 'blob'
    });
    return response.data;
  }

  async getPDFStatus(reportId: number): Promise<ApiResponse<{ report_id: number; pdf_exists: boolean; pdf_path?: string }>> {
    const response = await this.client.get(`/reports/${reportId}/pdf-status`);
    return { data: response.data, status: response.status };
  }

  // Utility methods
  setAuthToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  clearAuth(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
  }

  getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
  }
}

export const apiClient = new ApiClient();
export default apiClient;