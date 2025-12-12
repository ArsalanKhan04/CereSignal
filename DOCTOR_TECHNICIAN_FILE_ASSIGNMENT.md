# Doctor-Technician File Assignment Flow

## Overview
This document explains how EEG files uploaded by technicians are properly assigned to doctors so doctors can view them in their dashboard.

## Data Flow

### 1. Patient Creation by Technician
**Endpoint:** `POST /api/v1/users/`
- Technician creates a patient with `doctor_id` field
- Backend validates doctor exists and is active
- Patient record is created with `auth_user_id = doctor_id`
- **Result:** Patient is linked to the assigned doctor

### 2. File Upload by Technician
**Endpoint:** `POST /api/v1/signals/upload`
- Technician uploads EEG file with `patient_id`
- Backend validates patient exists (technicians can upload for any patient)
- File record is created with `user_id = patient_id`
- **Result:** File is linked to the patient

### 3. Doctor Viewing Files
**Endpoint:** `GET /api/v1/signals/files`
- Doctor queries files
- Backend joins `SignalFile` with `User` where `User.auth_user_id == doctor.id`
- **Result:** Doctor sees all files for patients assigned to them

## Database Relationships

```
AuthUser (Doctor)
    ↓ (auth_user_id)
User (Patient)
    ↓ (user_id)
SignalFile (EEG File)
```

## Access Control

### Technicians:
- ✅ Can create patients and assign them to doctors
- ✅ Can upload files for any patient
- ✅ Can view all files (for all patients they manage)

### Doctors:
- ✅ Can only see patients assigned to them (`auth_user_id = doctor.id`)
- ✅ Can only see files for their assigned patients
- ✅ Can upload files for their assigned patients

### Patients:
- ✅ Can only see their own files
- ❌ Cannot upload files

## Verification

The flow ensures:
1. ✅ Patient is assigned to doctor via `auth_user_id`
2. ✅ File is linked to patient via `user_id`
3. ✅ Doctor can query files through the patient relationship
4. ✅ Files uploaded by technicians are visible to the assigned doctor
