import axios, { AxiosInstance, AxiosResponse } from 'axios';
import logger from './logger';
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
  EEGReportVersion,
  ApiResponse,
  ApiError,
  NotificationItem,
  PatientIdLoginRequest,
  EEGBookmark,
  EEGBookmarkCreate,
  HospitalAdminRegisterRequest,
  InviteTokenInfo,
  StaffInviteRegisterRequest,
  AdminStats,
  StaffInvitation,
  StaffMember,
  DevAdminGlobalStats,
  DevAdminHospitalSummary,
  DevAdminHospitalDetail,
  DevAdminContact,
  DevAdminContactListResponse,
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
        const requestId = Math.random().toString(36).slice(2);
        (config as any).metadata = { startTime: Date.now(), requestId };
        (config.headers as any)['X-Request-ID'] = requestId;
        logger.apiRequest(config.method?.toUpperCase() || 'GET', config.url || '', {
          requestId,
          params: config.params,
        });
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        logger.apiError('REQUEST', error.config?.url || '', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => {
        const metadata = (response.config as any).metadata || {};
        const durationMs = metadata.startTime ? Date.now() - metadata.startTime : undefined;
        logger.apiResponse(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          durationMs
        );
        return response;
      },
      (error) => {
        const metadata = (error.config as any)?.metadata || {};
        const durationMs = metadata.startTime ? Date.now() - metadata.startTime : undefined;
        logger.apiError(
          error.config?.method?.toUpperCase() || 'GET',
          error.config?.url || '',
          {
            status: error.response?.status,
            durationMs,
            message: error.message,
            detail: error.response?.data?.detail,
          }
        );
        if (error.response?.status === 401) {
          const url = error.config?.url || '';
          const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/patient-login');
          localStorage.removeItem('auth_token');
          localStorage.removeItem('current_user');
          if (!isAuthEndpoint) {
            window.location.href = '/';
          }
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

  async loginPatient(data: PatientIdLoginRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await this.client.post('/auth/patient-login', data);
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

  async registerHospital(data: HospitalAdminRegisterRequest): Promise<ApiResponse<User>> {
    const response = await this.client.post('/auth/register/hospital', data);
    return { data: response.data, status: response.status };
  }

  async validateInviteToken(token: string): Promise<ApiResponse<InviteTokenInfo>> {
    const response = await this.client.get(`/auth/invite/${token}`);
    return { data: response.data, status: response.status };
  }

  async registerFromInvite(token: string, data: StaffInviteRegisterRequest): Promise<ApiResponse<User>> {
    const response = await this.client.post(`/auth/register/invite/${token}`, data);
    return { data: response.data, status: response.status };
  }

  // Admin methods
  async sendInvitation(data: { email: string; role: string }): Promise<ApiResponse<{ id: number; invited_email: string; expires_at: string; token: string }>> {
    const response = await this.client.post('/admin/invite', data);
    return { data: response.data, status: response.status };
  }

  async getAdminStats(): Promise<ApiResponse<AdminStats>> {
    const response = await this.client.get('/admin/stats');
    return { data: response.data, status: response.status };
  }

  async getStaff(): Promise<ApiResponse<StaffMember[]>> {
    const response = await this.client.get('/admin/staff');
    return { data: response.data, status: response.status };
  }

  async toggleStaffActive(userId: number): Promise<ApiResponse<{ id: number; is_active: boolean }>> {
    const response = await this.client.put(`/admin/staff/${userId}/toggle-active`);
    return { data: response.data, status: response.status };
  }

  async getInvitations(): Promise<ApiResponse<StaffInvitation[]>> {
    const response = await this.client.get('/admin/invitations');
    return { data: response.data, status: response.status };
  }

  // Patient management methods
  async getPatients(
    includeUnassigned?: boolean,
    search?: string,
    skip?: number,
    limit?: number,
    reportSent?: boolean,
  ): Promise<ApiResponse<Patient[]>> {
    const params: Record<string, any> = {};
    if (includeUnassigned) params.include_unassigned = true;
    if (search) params.search = search;
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;
    if (reportSent !== undefined) params.report_sent = reportSent;
    const response = await this.client.get('/users/', { params });
    return { data: response.data, status: response.status };
  }

  async markReportSent(patientId: number): Promise<ApiResponse<Patient>> {
    const response = await this.client.post(`/users/${patientId}/mark-report-sent`);
    return { data: response.data, status: response.status };
  }

  async sendPortalEmail(patientId: number): Promise<ApiResponse<Patient>> {
    const response = await this.client.post(`/users/${patientId}/send-portal-email`);
    return { data: response.data, status: response.status };
  }

  async loginWithPortalToken(token: string): Promise<ApiResponse<{ access_token: string; token_type: string; expires_in: number }>> {
    const response = await this.client.get(`/auth/patient-portal/${token}`);
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
  async uploadFile(file: File, patientId?: number, options?: { skipInference?: boolean }): Promise<ApiResponse<FileUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    if (patientId) {
      formData.append('patient_id', patientId.toString());
    }
    if (options?.skipInference) {
      formData.append('skip_inference', 'true');
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

  async getBookmarks(fileId: number): Promise<ApiResponse<EEGBookmark[]>> {
    const response = await this.client.get(`/signals/files/${fileId}/bookmarks`);
    return { data: response.data, status: response.status };
  }

  async createBookmark(fileId: number, data: EEGBookmarkCreate): Promise<ApiResponse<EEGBookmark>> {
    const response = await this.client.post(`/signals/files/${fileId}/bookmarks`, data);
    return { data: response.data, status: response.status };
  }

  async deleteBookmark(fileId: number, bookmarkId: number): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.delete(`/signals/files/${fileId}/bookmarks/${bookmarkId}`);
    return { data: response.data, status: response.status };
  }

  async checkInferenceStatus(fileId: number): Promise<ApiResponse<{ file_id: number; condition: string; inference_status: string; message: string; task_id?: string }>> {
    const response = await this.client.get(`/signals/files/${fileId}/inference-status`);
    return { data: response.data, status: response.status };
  }

  async checkReportStatus(fileId: number): Promise<ApiResponse<any>> {
    const response = await this.client.get(`/signals/files/${fileId}/report-status`);
    return { data: response.data, status: response.status };
  }

  async deleteFile(fileId: number): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.delete(`/signals/files/${fileId}`);
    return { data: response.data, status: response.status };
  }

  async updateFileLabel(fileId: number, condition: 'normal' | 'abnormal'): Promise<ApiResponse<SignalFile>> {
    const response = await this.client.patch(`/signals/files/${fileId}/label`, { condition });
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

  // Version history methods
  async getReportVersions(reportId: number): Promise<ApiResponse<EEGReportVersion[]>> {
    const response = await this.client.get(`/reports/${reportId}/versions`);
    return { data: response.data, status: response.status };
  }

  async getReportVersion(reportId: number, versionId: number): Promise<ApiResponse<EEGReportVersion>> {
    const response = await this.client.get(`/reports/${reportId}/versions/${versionId}`);
    return { data: response.data, status: response.status };
  }

  async restoreReportVersion(reportId: number, versionId: number): Promise<ApiResponse<EEGReport>> {
    const response = await this.client.post(`/reports/${reportId}/versions/${versionId}/restore`);
    return { data: response.data, status: response.status };
  }

  // Dev Admin methods (superuser only)
  async getDevAdminStats(): Promise<ApiResponse<DevAdminGlobalStats>> {
    const response = await this.client.get('/dev-admin/stats');
    return { data: response.data, status: response.status };
  }

  async getDevAdminHospitals(): Promise<ApiResponse<DevAdminHospitalSummary[]>> {
    const response = await this.client.get('/dev-admin/hospitals');
    return { data: response.data, status: response.status };
  }

  async getDevAdminHospitalDetail(id: number): Promise<ApiResponse<DevAdminHospitalDetail>> {
    const response = await this.client.get(`/dev-admin/hospitals/${id}`);
    return { data: response.data, status: response.status };
  }

  async getDevAdminContacts(
    skip = 0,
    limit = 20,
    unreadOnly = false
  ): Promise<ApiResponse<DevAdminContactListResponse>> {
    const response = await this.client.get('/dev-admin/contacts', {
      params: { skip, limit, unread_only: unreadOnly },
    });
    return { data: response.data, status: response.status };
  }

  async markContactRead(id: number): Promise<ApiResponse<DevAdminContact>> {
    const response = await this.client.put(`/dev-admin/contacts/${id}/read`);
    return { data: response.data, status: response.status };
  }

  async downloadHospitalFile(hospitalId: number, fileId: number, filename: string): Promise<void> {
    const response = await this.client.get(
      `/dev-admin/hospitals/${hospitalId}/files/${fileId}/download`,
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(new Blob([response.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async downloadHospitalReport(
    hospitalId: number,
    reportId: number,
    filename: string
  ): Promise<void> {
    const response = await this.client.get(
      `/dev-admin/hospitals/${hospitalId}/reports/${reportId}/download`,
      { responseType: 'blob' }
    );
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async downloadHospitalZip(
    hospitalId: number,
    filename: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    const token = localStorage.getItem('auth_token');
    const response = await axios.get(
      `${this.baseURL}/dev-admin/hospitals/${hospitalId}/download`,
      {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        onDownloadProgress: (evt) => {
          if (onProgress && evt.total) {
            onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      }
    );
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Contact form
  async submitContact(data: {
    first_name: string;
    last_name: string;
    email: string;
    hospital?: string;
    role?: string;
    country?: string;
    volume?: string;
    interest?: string;
    message?: string;
  }): Promise<ApiResponse<any>> {
    const response = await this.client.post('/contact/', data);
    return { data: response.data, status: response.status };
  }

  // Utility methods
  getPublicBaseUrl(): string {
    return this.baseURL.replace(/\/api\/v1\/?$/, '');
  }

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
