export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,50}$/;
const NAME_REGEX = /^[\p{L}'\-\s]+$/u;

export function validateRequired(value: string | undefined | null, field: string, label: string): ValidationError | null {
  if (!value || !value.trim()) {
    return { field, message: `${label} is required.` };
  }
  return null;
}

export function validateEmail(value: string | undefined | null, field?: string): ValidationError | null {
  const f = field || 'email';
  if (!value || !value.trim()) {
    return { field: f, message: 'Email address is required.' };
  }
  if (!EMAIL_REGEX.test(value.trim())) {
    return { field: f, message: 'Please enter a valid email address.' };
  }
  return null;
}

export function validateUsername(value: string | undefined | null): ValidationError | null {
  if (!value || !value.trim()) {
    return { field: 'username', message: 'Username is required.' };
  }
  if (value.trim().length < 3) {
    return { field: 'username', message: 'Username must be at least 3 characters.' };
  }
  if (value.trim().length > 50) {
    return { field: 'username', message: 'Username must be at most 50 characters.' };
  }
  if (!USERNAME_REGEX.test(value.trim())) {
    return { field: 'username', message: 'Username may only contain letters, numbers, and underscores.' };
  }
  return null;
}

export function validatePassword(value: string | undefined | null): ValidationError | null {
  if (!value) {
    return { field: 'password', message: 'Password is required.' };
  }
  if (value.length < 6) {
    return { field: 'password', message: 'Password must be at least 6 characters.' };
  }
  return null;
}

export function validateConfirmPassword(password: string | undefined | null, confirm: string | undefined | null): ValidationError | null {
  if (!confirm) {
    return { field: 'confirm_password', message: 'Please confirm your password.' };
  }
  if (password !== confirm) {
    return { field: 'confirm_password', message: 'Passwords do not match.' };
  }
  return null;
}

export function validateName(value: string | undefined | null, field: string, label: string, maxLen: number = 100): ValidationError | null {
  if (!value || !value.trim()) {
    return { field, message: `${label} is required.` };
  }
  if (value.trim().length < 1) {
    return { field, message: `${label} is required.` };
  }
  if (value.trim().length > maxLen) {
    return { field, message: `${label} must be at most ${maxLen} characters.` };
  }
  return null;
}

export function validatePhone(value: string | undefined | null, field?: string): ValidationError | null {
  const f = field || 'phone';
  if (!value || !value.trim()) {
    return null; // phone is optional
  }
  if (!PHONE_REGEX.test(value.trim())) {
    return { field: f, message: 'Please enter a valid phone number (7-20 digits, + allowed).' };
  }
  return null;
}

export function validateAge(value: string | undefined | null): ValidationError | null {
  if (!value || !value.trim()) {
    return null; // age optional
  }
  const num = Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { field: 'age', message: 'Age must be a whole number.' };
  }
  if (num < 0 || num > 130) {
    return { field: 'age', message: 'Age must be between 0 and 130.' };
  }
  return null;
}

export function validatePatientAge(value: string | undefined | null): ValidationError | null {
  if (!value || !value.trim()) {
    return null;
  }
  const num = Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { field: 'patient_age', message: 'Age must be a whole number.' };
  }
  if (num < 0 || num > 150) {
    return { field: 'patient_age', message: 'Age must be between 0 and 150.' };
  }
  return null;
}

export function validateYearsExperience(value: string | undefined | null): ValidationError | null {
  if (!value || !value.trim()) {
    return null;
  }
  const num = Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { field: 'years_experience', message: 'Years of experience must be a whole number.' };
  }
  if (num < 0 || num > 100) {
    return { field: 'years_experience', message: 'Years of experience must be between 0 and 100.' };
  }
  return null;
}

export function validateDateOfBirth(value: string | undefined | null): ValidationError | null {
  if (!value) return null;
  const dob = new Date(value);
  if (isNaN(dob.getTime())) {
    return { field: 'date_of_birth', message: 'Please enter a valid date.' };
  }
  if (dob > new Date()) {
    return { field: 'date_of_birth', message: 'Date of birth cannot be in the future.' };
  }
  return null;
}

export function validateGender(value: string | undefined | null, field?: string): ValidationError | null {
  const f = field || 'gender';
  if (!value) return null;
  if (!['M', 'F', 'Other'].includes(value)) {
    return { field: f, message: 'Please select a valid gender.' };
  }
  return null;
}

export function validateBloodType(value: string | undefined | null): ValidationError | null {
  if (!value) return null;
  const valid = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (!valid.includes(value)) {
    return { field: 'blood_type', message: 'Please select a valid blood type.' };
  }
  return null;
}

export function validateHospitalName(value: string | undefined | null): ValidationError | null {
  if (!value || !value.trim()) {
    return { field: 'hospital_name', message: 'Hospital name is required.' };
  }
  if (value.trim().length < 2) {
    return { field: 'hospital_name', message: 'Hospital name must be at least 2 characters.' };
  }
  if (value.trim().length > 255) {
    return { field: 'hospital_name', message: 'Hospital name must be at most 255 characters.' };
  }
  return null;
}

export function validateRequiredSelect(value: string | undefined | null, field: string, label: string): ValidationError | null {
  if (!value || !value.trim()) {
    return { field, message: `Please select ${label.toLowerCase()}.` };
  }
  return null;
}

export function validateMaxLength(value: string | undefined | null, field: string, label: string, maxLen: number): ValidationError | null {
  if (value && value.trim().length > maxLen) {
    return { field, message: `${label} must be at most ${maxLen} characters.` };
  }
  return null;
}

export function validateInteger(value: string | undefined | null, field: string, label: string, min: number, max: number): ValidationError | null {
  if (!value || !value.trim()) return null;
  const num = Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { field, message: `${label} must be a whole number.` };
  }
  if (num < min || num > max) {
    return { field, message: `${label} must be between ${min} and ${max}.` };
  }
  return null;
}

export function collectErrors(...checks: (ValidationError | null)[]): ValidationError[] {
  return checks.filter((e): e is ValidationError => e !== null);
}

export function extractApiErrors(detail: any, fallback?: string): { general?: string; fields: ValidationError[] } {
  if (!detail) {
    return { general: fallback || 'An unexpected error occurred.', fields: [] };
  }
  if (typeof detail === 'string') {
    return { general: detail, fields: [] };
  }
  if (Array.isArray(detail)) {
    const fields: ValidationError[] = detail.map((d: any) => ({
      field: d.field || 'unknown',
      message: d.message || d.msg || 'Invalid value.',
    }));
    return { fields, general: fields.length === 1 ? fields[0].message : undefined };
  }
  return { general: String(detail), fields: [] };
}
