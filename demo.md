# CereSignal Demo Flow & Implementation Plan

## Overview

**Goal:** A 3-4 minute guided walkthrough of CereSignal covering all four user roles (Admin → Technician → Doctor → Patient) with a single linear path. Pre-seeded data is loaded via a Supabase migration so the demo works out-of-the-box. Floating step instructions overlay the UI at each stage, with "fast-forward" buttons to skip role transitions (simulate email links, auto-fill logins, and swap between pre-seeded accounts).

**Architecture:** A `DemoProvider` context wraps the app during demo mode, tracking the current step and supplying demo-specific data (pre-seeded accounts, invitation tokens, portal tokens). A `DemoGuide` component renders the floating instruction card. Pre-seeded demo buttons appear inline on relevant pages when demo mode is active.

**Total projected time with pre-seeded data:** ~3:00 minutes
**Total projected time with live registration + seeding:** ~3:45 minutes

---

## Pre-Seeded Data

The demo database must contain the following records, inserted via a SQL migration (`backend/migrations/XXXX_demo_seed.sql`) or Python seed script that runs on CI deployment.

### Hospital
| Field | Value |
|---|---|
| `id` | 1 |
| `name` | Neurolink Diagnostics |
| `code` | `neur` (auto-generated) |
| `address` | 221B Baker Street, London |
| `phone` | +44 20 7946 0958 |
| `email` | admin@neurolink.demo.local |

### Auth Users
| # | username | password (plain) | user_type | first_name | last_name | email | title | specialization | hospital_id | is_active |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `admin` | `password` | admin | Sarah | Mitchell | admin@neurolink.demo.local | — | — | 1 | true |
| 2 | `tech` | `password` | technician | Jennifer | Park | jenny.tech@demo.local | — | EEG Technology | 1 | true |
| 3 | `doc` | `password` | doctor | David | Chen | david.chen@demo.local | Dr. | Clinical Neurophysiology | 1 | true |

### StaffInvitation (2 invitations — both already "used" in pre-seeded flow)
| # | hospital_id | invited_email | role | token | used_at |
|---|---|---|---|---|---|
| 1 | 1 | jenny.tech@demo.local | technician | `invite-demo-tech-001` | (7 days from seed) |
| 2 | 1 | david.chen@demo.local | doctor | `invite-demo-doc-001` | (7 days from seed) |

If we want the admin to **live-invite** during the demo: keep these as **pending** (used_at = NULL, expires_at = 7 days from seed). If we want to skip live invite and jump straight to pre-registered accounts, mark them used.

**Recommended:** Use **live invite** for the technician (to show the admin inviting flow) and **pre-seeded** accounts for the doctor (to show autofill login). See step flow below.

### Patients (User records)
| # | name | email | phone | medical_id | gender | date_of_birth | blood_type | auth_user_id | doctor_id | hospital_id | report_sent | portal_token |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Emily Richardson | emily.r@demo.local | +44 7700 900001 | MED-2025-0042 | F | 1992-06-15 | A+ | 2 (tech) | 3 (doc) | 1 | false | `portal-demo-emily-001` |
| 2 | James Okafor | james.o@demo.local | +44 7700 900002 | MED-2025-0087 | M | 1978-03-22 | O+ | 2 (tech) | 3 (doc) | 1 | false | `portal-demo-james-002` |
| 3 | Aisha Patel | aisha.p@demo.local | +44 7700 900003 | MED-2025-0156 | F | 1985-11-08 | B+ | 2 (tech) | 3 (doc) | 1 | true | `portal-demo-aisha-003` |

### Signal Files (pre-processed EEGs with results)
| # | id | user_id | original_filename | processing_status | condition | neurogate_probability |
|---|---|---|---|---|---|---|
| 1 | 101 | 1 (Emily) | emily_eeg_resting.edf | completed | abnormal | 87.3 |
| 2 | 102 | 1 (Emily) | emily_eeg_sleep.edf | completed | abnormal | 91.5 |
| 3 | 201 | 2 (James) | james_eeg_routine.edf | completed | normal | 12.1 |
| 4 | 301 | 3 (Aisha) | aisha_eeg_followup.edf | completed | normal | 5.8 |

### EEG Report (pre-generated)
| # | id | file_id | user_id | doctor_id | factual_report (excerpt) | impression | report_date |
|---|---|---|---|---|---|---|---|
| 1 | 5001 | 101 | 1 (Emily) | 3 (doc) | "Background activity shows posterior dominant rhythm at 9 Hz... intermittent left temporal sharp waves noted..." | abnormal | 2025-04-28 |
| 2 | 5002 | 301 | 3 (Aisha) | 3 (doc) | "Well-regulated 10 Hz alpha rhythm... no epileptiform discharges identified..." | normal | 2025-04-25 |

### EEG Bookmarks
| # | file_id | comment | created_by |
|---|---|---|---|
| 1 | 101 | "Left temporal sharp wave at ~3s — correlate clinically" | 3 (doc) |
| 2 | 101 | "Spike-and-wave complex at ~8s" | 3 (doc) |

### Notifications
| # | user_id (doctor) | message | patient_id | is_read |
|---|---|---|---|---|
| 1 | 3 | "New patient Emily Richardson assigned to you" | 1 | false |
| 2 | 3 | "New patient James Okafor assigned to you" | 2 | false |
| 3 | 3 | "Patient Aisha Patel's EEG report is ready for review" | 3 | false |

---

## Demo Flow — Step-by-Step

Each step has:
- **Step ID** for the `DemoContext`
- **Route** the user should be on
- **What the user sees** (the current UI state)
- **Floating instruction text** (shown in `DemoGuide` banner/card)
- **Highlight targets** (CSS selectors or component IDs to spotlight)
- **Demo-specific buttons** (fast-forward transitions)
- **Relevant files and line numbers** for implementation

### Step Structure

The demo is organized into **8 phases** of 3-5 steps each. Each step is a position in the demo flow where the floating guide shows specific instructions.

---

### PHASE 0: Landing Page → Start Demo

#### Step 0.1 — Landing Page Entry
| Property | Value |
|---|---|
| **Route** | `/` |
| **Duration** | ~5s |
| **Instruction** | Welcome to CereSignal — an AI-powered EEG analysis and clinical reporting platform. We'll walk you through the complete workflow in just a few minutes. Click **"Start Demo"** to begin. |
| **UI** | LandingPage with full marketing content. A prominent demo CTA button ("▶ Start Guided Demo") appears at the top-right of the hero section. |
| **Demo Button** | "▶ Start Guided Demo" → Sets `demoMode=true`, advances to Step 1.0 |
| **Files** | `frontend/src/pages/LandingPage.tsx:1-384` — Add demo CTA button to hero section |
| **New** | `frontend/src/components/DemoGuide.tsx` — Floating instruction card component |
| **New** | `frontend/src/contexts/DemoContext.tsx` — Demo state management |

---

### PHASE 1: Admin Registration & Dashboard (~60 seconds)

#### Step 1.0 — Hospital Signup (with Demo Autofill)
| Property | Value |
|---|---|
| **Route** | `/register/hospital` |
| **Duration** | ~10s |
| **Instruction** | Every CereSignal workspace starts with a hospital. An admin account is created alongside it. **Use the demo autofill button** to pre-populate the form, then click "Create Hospital Workspace". |
| **UI** | HospitalSignupPage form. A floating demo button "⚡ Autofill Demo Data" sits near the submit button. Clicking it fills all fields with demo values. |
| **Highlight** | The "Create Hospital Workspace" button pulses. |
| **Demo Button** | "⚡ Autofill Demo Data" → Fills `HospitalSignupPage` form with: Hospital="Neurolink Diagnostics", First="Sarah", Last="Mitchell", Username="admin", Email="admin@neurolink.demo.local", Password="password", Confirm="password" |
| **Files** | `frontend/src/pages/HospitalSignupPage.tsx:46-57` — formData state |
| **Files** | `frontend/src/pages/HospitalSignupPage.tsx:66-95` — handleSubmit |
| **Files** | `backend/app/api/v1/endpoints/auth.py:43-99` — `/register/hospital` endpoint |

#### Step 1.1 — Admin Dashboard Introduction
| Property | Value |
|---|---|
| **Route** | `/dashboard` (admin role) |
| **Duration** | ~8s |
| **Instruction** | Welcome Sarah! This is the **Admin Dashboard**. Here you can see your hospital's key metrics: active doctors, technicians, total patients, and pending reports. Below you manage your staff and send invitations. |
| **UI** | AdminDashboard fully loaded. Stats cards and staff tables visible. |
| **Highlight** | The 4 stat cards at top (lines 205-236). |
| **Files** | `frontend/src/pages/AdminDashboard.tsx:144-149` — statCards |
| **Files** | `frontend/src/pages/AdminDashboard.tsx:205-236` — stat card render loop |
| **Files** | `backend/app/api/v1/endpoints/admin.py:89-138` — GET /admin/stats |

#### Step 1.2 — Invite Technician
| Property | Value |
|---|---|
| **Route** | `/dashboard` (admin role) |
| **Duration** | ~10s |
| **Instruction** | Let's invite a technician. Type **jenny.tech@demo.local** in the email field (or click autofill), select **Technician** as the role, and click "Send Invitation". |
| **UI** | Focus shifts to the "Invite Staff" card on the right column. The email field auto-fills with jenny.tech@demo.local. |
| **Highlight** | The "Invite Staff" card (lines 337-375). |
| **Demo Button** | "⚡ Autofill Jenny" → Sets `inviteEmail`="jenny.tech@demo.local", `inviteRole`="technician" |
| **Files** | `frontend/src/pages/AdminDashboard.tsx:334-375` — Invite Staff card |
| **Files** | `frontend/src/pages/AdminDashboard.tsx:108-133` — handleSendInvite |
| **Files** | `backend/app/api/v1/endpoints/admin.py:35-86` — POST /admin/invite |
| **Files** | `backend/app/services/email_service.py:172-234` — send_invitation_email |

#### Step 1.3 — Invite Technician (Post-Send)
| Property | Value |
|---|---|
| **Route** | `/dashboard` (admin role) |
| **Duration** | ~8s |
| **Instruction** | Invitation sent! ✅ Jenny received an email with a registration link. In the demo, a **"Go to Jenny's Invitation →"** button below simulates clicking that email link. Click it now to continue. |
| **UI** | Success alert shown. The new invitation appears in the Invitations list as "jenny.tech@demo.local" with a "7d" expiry chip. A demo-only button appears:
| **Demo Button** | "Go to Jenny's Invitation →" — Logout + navigate to `/register/invite/{token}` with the invitation token returned from the API. |
| **Files** | `frontend/src/pages/AdminDashboard.tsx:362-373` — success/error alerts |
| **Files** | `frontend/src/pages/AdminDashboard.tsx:377-426` — invitations list |
| **Files** | `backend/app/models/hospital.py` — StaffInvitation model (token field) |
| **New Logic** | The demo button calls `logout()` then `navigate('/register/invite/' + token)` |

#### Step 1.4 — Technician Registration via Invite
| Property | Value |
|---|---|
| **Route** | `/register/invite/${token}` |
| **Duration** | ~10s |
| **Instruction** | This is what Jenny sees when she clicks the email link. The form recognizes the invitation and pre-fills the email. Complete the form using the **autofill button**, then click "Complete Registration". |
| **UI** | StaffInviteRegistrationPage shows "You're Invited!" sidebar, token validation passes, invited email displayed read-only. |
| **Highlight** | The "Complete Registration" button. |
| **Demo Button** | "⚡ Autofill Jenny" → Fills first_name="Jennifer", last_name="Park", username="tech", password="password", confirm="password", title="", specialization="EEG Technology", license_number="TECH-2025-0042", phone="+44 7700 900100" |
| **Files** | `frontend/src/pages/StaffInviteRegistrationPage.tsx:43-130` — full component |
| **Files** | `frontend/src/pages/StaffInviteRegistrationPage.tsx:106-130` — handleSubmit |
| **Files** | `backend/app/api/v1/endpoints/auth.py:101-178` — GET /invite/{token}, POST /register/invite/{token} |

---

### PHASE 2: Technician — Add Patient & Process EEG (~50 seconds)

#### Step 2.0 — Technician Dashboard Introduction
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role) |
| **Duration** | ~6s |
| **Instruction** | Welcome Jenny! This is the **Technician Dashboard**. Technicians manage patient records, upload EEG files, assign patients to doctors, and send reports. Currently there are no patients — let's add one. |
| **UI** | TechnicianDashboard with empty patient list. Status filter toggles at top (Pending Review / Examined / Report Sent / All). |
| **Highlight** | The "Pending Review" toggle button. |
| **Files** | `frontend/src/pages/TechnicianDashboard.tsx:1-161` — full dashboard |
| **Files** | `frontend/src/pages/TechnicianDashboard.tsx:131-141` — ToggleButtonGroup for status filters |

#### Step 2.1 — Add a New Patient
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role) |
| **Duration** | ~12s |
| **Instruction** | Click the **"+ Add Patient"** button. Fill in the patient details using the **autofill button**, then click "Save". In a real clinic, you'd also assign a doctor from the dropdown. |
| **UI** | Add Patient dialog opens. Form with sections: Personal Info, Medical Details, Contact Info. |
| **Highlight** | The "+ Add Patient" button, then the Doctor Assignment dropdown, then the "Save" button. |
| **Demo Button** | "⚡ Autofill Patient" → Fills name="Emily Richardson", email="emily.r@demo.local", phone="+44 7700 900001", medical_id="MED-2025-0042", gender="F", date_of_birth="1992-06-15", blood_type="A+", doctor_id=3 (Dr. Chen) |
| **Files** | `frontend/src/components/Patients.tsx:54-127` — component state & form data |
| **Files** | `frontend/src/components/Patients.tsx:779-1039` — Add/Edit Patient dialog (approximate) |
| **Files** | `backend/app/api/v1/endpoints/users.py:26-207` — POST /users/ |
| **Files** | `backend/app/models/user.py:12-63` — User model |

#### Step 2.2 — Upload EEG File
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role, patient expanded) |
| **Duration** | ~10s |
| **Instruction** | After saving, Emily's patient card appears. Now click **"Upload EEG File"** on her card. In the backend, this triggers the AI pipeline: (1) EDF parsing → (2) NeuroGate binary classification → (3) NeuroTransformer per-channel analysis → (4) Topomap generation → (5) LLM report drafting. |
| **UI** | Emily's patient card shows with an upload area. Upload progression: file selected → uploading spinner → "Processing..." chip appears on the file. Status badge shows "processing" → "completed" after inference. |
| **Highlight** | The "Upload EEG File" button on the patient card, then the processing status chips. |
| **Demo Note** | A demo EDF file should be bundled or fetched from a demo URL. The `FileUpload` component should accept a `demoFileUrl` prop to auto-fetch the file. |
| **Files** | `frontend/src/components/FileUpload.tsx:16-100` — FileUpload component |
| **Files** | `frontend/src/components/Patients.tsx:159-199` — polling interval for processing status |
| **Files** | `backend/app/api/v1/endpoints/signals.py:89-520` — POST /signals/upload |
| **Files** | `backend/inference/infer.py:1-415` — Celery inference pipeline |

#### Step 2.3 — Processing Status & Results
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role) |
| **Duration** | ~8s |
| **Instruction** | The EEG is processing. CereSignal's AI models analyze the signals in about 15-30 seconds. The status updates automatically — watch the chip change from "processing" to "completed". Meanwhile, look at the other tabs: **Examined** and **Report Sent** show patients at different workflow stages. |
| **UI** | Patient card shows file with "processing" chip. Brief wait while polling runs. Chip changes to "completed" with condition label ("Abnormal" / "Normal"). |
| **Highlight** | The processing status chip, then the ToggleButtonGroup (Pending Review / Examined / Report Sent / All). |
| **Demo Optimization** | If inference takes too long, the demo can show pre-seeded completed files immediately after upload (fake the transition). Or use a smaller/optimized EDF that processes quickly. |
| **Files** | `frontend/src/components/Patients.tsx:159-199` — polling logic |
| **Files** | `backend/app/api/v1/endpoints/signals.py:986-1063` — GET /signals/files/{id}/inference-status |

#### Step 2.4 — Quick Transition: Technician with Full Workload
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role, but with pre-seeded data) |
| **Duration** | ~8s |
| **Instruction** | Jenny often manages multiple patients. Let's see her full workload. Click **"Show Full Workload →"** below to view all her patients at different stages: pending review, examined, and report sent. |
| **UI** | A demo-only button appears at the bottom of the patient list area. |
| **Demo Button** | "Show Full Workload →" — Signs out, logs in as `tech` again, but this time the backend returns the pre-seeded data (3 patients: Emily pending, James pending, Aisha report-sent). Alternatively, this can be implemented as a demo mode toggle that loads pre-seeded patients into the existing technician session. |
| **Implementation** | Simpler approach: In demo mode, after uploading Emily's file, load the pre-seeded patient data by calling `GET /users/` which now returns the seed data since we're logged in as the same technician. The seed migration should have already created Patients 1, 2, 3 with `auth_user_id=2` (tech). |
| **Files** | `frontend/src/pages/TechnicianDashboard.tsx:26-27` — statusFilter state |
| **Files** | `frontend/src/components/Patients.tsx:139-145` — loadPatients effect |

---

### PHASE 3: Doctor Login via Autofill (~10 seconds)

#### Step 3.0 — Login Page with Autofill Buttons
| Property | Value |
|---|---|
| **Route** | `/login` |
| **Duration** | ~8s |
| **Instruction** | Now let's see the doctor's perspective. On the login page, notice the **demo autofill buttons** next to each account type. Click **"🔑 Login as Dr. David Chen"** to auto-fill the doctor credentials, then click **"Sign In"**. |
| **UI** | LoginPage with 3 demo autofill buttons stacked vertically near the form (or as chips below the "Register your hospital" button):
1. "🔑 Login as Dr. David Chen" (doctor)
2. "🔑 Login as Jenny Park" (technician)
3. "🔑 Login as Emily R." (patient, via patient ID) |
| **Highlight** | The autofill buttons, then the "Sign In" button. |
| **Demo Button** | "🔑 Login as Dr. David Chen" → Sets `formData.username`="doc", `formData.password`="password". Does NOT auto-submit — user must click "Sign In". |
| **Files** | `frontend/src/pages/LoginPage.tsx:30-303` — full LoginPage |
| **Files** | `frontend/src/pages/LoginPage.tsx:32-35` — formData state |
| **Files** | `frontend/src/pages/LoginPage.tsx:45-57` — handleSubmit |
| **Changed** | `LoginPage.tsx:179-209` — Add DemoAutofill section between the form submit button and the "New to CereSignal?" divider |

---

### PHASE 4: Doctor Dashboard & EEG Review (~80 seconds)

#### Step 4.0 — Doctor Dashboard Introduction
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role) |
| **Duration** | ~8s |
| **Instruction** | Welcome Dr. Chen! Notice the notification bell 🔔 with 3 unread alerts — these tell you when new patients are assigned and when reports are ready. The toggle at the top lets you switch between **"Assigned to me"** and **"All patients"**. Currently, 2 patients are pending your review. |
| **UI** | DoctorDashboard with 3 patient cards (Emily — pending, James — pending, Aisha — examined). Notification bell with red dot. Toggle for assigned/all. |
| **Highlight** | The notification bell badge, then the "Pending Review" toggle. |
| **Files** | `frontend/src/pages/DoctorDashboard.tsx:34-303` — full DoctorDashboard |
| **Files** | `frontend/src/pages/DoctorDashboard.tsx:56-70` — notification loading |
| **Files** | `frontend/src/pages/DoctorDashboard.tsx:159-165` — notification bell with Badge |
| **Files** | `backend/app/api/v1/endpoints/notifications.py:19-52` — GET /notifications/ |

#### Step 4.1 — Open Patient Details (Emily Richardson)
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role, patient detail open) |
| **Duration** | ~8s |
| **Instruction** | Click on **Emily Richardson's** patient card to open the full detail view. Here you can see her profile, EEG files, and processing results. Notice the **"View EEG"** and **"Normal / Abnormal"** label buttons. Click **"View EEG"** to inspect her brain wave recordings. |
| **UI** | Full-screen patient detail dialog opens. Shows Emily's profile chips, her two EEG files (emily_eeg_resting.edf — Abnormal, emily_eeg_sleep.edf — Abnormal), and action buttons per file. |
| **Highlight** | The "View EEG" button, then the "Normal" / "Abnormal" label buttons. |
| **Files** | `frontend/src/components/Patients.tsx:1234-1279` — Patient detail dialog header |
| **Files** | `frontend/src/components/Patients.tsx:1082-1111` — Normal/Abnormal label buttons |
| **Files** | `frontend/src/components/Patients.tsx:1174-1186` — View EEG button |

#### Step 4.2 — EEG Viewer Walkthrough
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role, EEG viewer full-screen) |
| **Duration** | ~12s |
| **Instruction** | This is the EEG viewer with Plotly.js. Key features: (1) **Channel groups** — toggle between bipolar montage, average reference, and individual channels. (2) **Sensitivity** slider — zoom in/out of the waveform. (3) **Time navigation** — scroll and zoom through the recording. (4) **Bookmarks** — click the bookmark icon to save notable segments for discussions or reports. Try bookmarking a segment now! |
| **UI** | Full-screen EEGPlot dialog. Plotly.js chart with 19-channel EEG traces. Left sidebar with channel group selector and sensitivity controls. Bookmark button in the toolbar or on right-click. |
| **Highlight** | Channel group dropdown, sensitivity slider, then bookmark button. |
| **Files** | `frontend/src/components/EEGPlot.tsx:51-803` — EEGPlot component |
| **Files** | `frontend/src/components/Patients.tsx:1194-1214` — EEG viewer dialog wrapper |
| **Files** | `backend/app/api/v1/endpoints/signals.py:302-500` — Bookmarks CRUD |

#### Step 4.3 — Create/Edit Report (AI-Powered)
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role, ReportForm open) |
| **Duration** | ~12s |
| **Instruction** | After reviewing the EEG, click **"Create Report"** (or "Edit Report" if one exists). The form is pre-populated with AI-generated content: factual report text, impression, and PDR values. Review and edit if needed, fill in your doctor info, then click **"Save Report"**. |
| **UI** | Full-screen ReportForm dialog. Sections: Patient Info (auto-filled), Report Info (date, ref physician, indications, technique), Factual Report (AI-generated, editable textarea), Impression (dropdown: Normal/Abnormal, auto-set from ML), Doctor Info (auto-filled from profile, with save/load). "Save Report" button at bottom. |
| **Highlight** | The Factual Report textarea (showing AI-generated content), then the "Save Report" button. |
| **Note** | For Emily, the pre-seeded report (id=5001) already exists. Doctor clicks "Edit Report" to review it. For James, there's no report yet — "Create Report" flow. |
| **Files** | `frontend/src/components/ReportForm.tsx:44-778` — ReportForm component |
| **Files** | `frontend/src/components/ReportForm.tsx:175-266` — AI report polling |
| **Files** | `frontend/src/components/Patients.tsx:1112-1129` — Create/Edit Report buttons |
| **Files** | `backend/app/api/v1/endpoints/reports.py:63-159` — POST /reports/, PUT /reports/{id} |

#### Step 4.4 — Report Version History & PDF Download
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role) |
| **Duration** | ~10s |
| **Instruction** | Reports support **version history** — every edit creates a snapshot you can restore later. Click the history icon to view versions. When ready, click **"Download Report"** to generate and download the PDF. This is the final deliverable for the patient. |
| **UI** | After saving the report, the patient card shows the new report. Version History button visible. Download Report button visible. |
| **Highlight** | Version History icon button, then Download Report button. |
| **Files** | `frontend/src/components/ReportVersionHistory.tsx` — ReportVersionHistory component |
| **Files** | `frontend/src/components/Patients.tsx:1131-1145` — Download Report button |
| **Files** | `backend/app/api/v1/endpoints/reports.py:370-514` — Version history & restore |
| **Files** | `backend/app/api/v1/endpoints/reports.py:569-738` — PDF generation & download |

#### Step 4.5 — Topographic Map & Additional Features
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role) |
| **Duration** | ~8s |
| **Instruction** | Other powerful features include the **Topographic Map** — a heatmap of brain activity across the scalp, automatically generated from the EEG data. Doctors can also mark files as **Normal** or **Abnormal** with a single click using the label buttons. These labels feed into hospital analytics. |
| **UI** | TopographicMap dialog (triggered from patient detail). Normal/Abnormal label buttons visible. |
| **Highlight** | Topomap button, then label buttons. |
| **Files** | `frontend/src/components/TopographicMap.tsx` — TopographicMap component |
| **Files** | `frontend/src/components/Patients.tsx:1082-1111` — label buttons |
| **Files** | `backend/app/api/v1/endpoints/signals.py:873-895` — GET /signals/files/{id}/topomap |
| **Files** | `backend/app/api/v1/endpoints/signals.py:1194-1215` — PATCH /signals/files/{id}/label |

#### Step 4.6 — Transition to Technician (Same Hospital)
| Property | Value |
|---|---|
| **Route** | `/dashboard` (doctor role) |
| **Duration** | ~5s |
| **Instruction** | Great work! Dr. Chen has completed his review. Now let's switch back to the technician's view to send the report to the patient. Click **"Continue as Jenny (Technician) →"** below. |
| **Demo Button** | "Continue as Jenny (Technician) →" — Logout + login as `tech` + navigate to `/dashboard` with statusFilter='examined' to show patients with completed reports. |

---

### PHASE 5: Technician Sends Report to Patient (~25 seconds)

#### Step 5.0 — Technician View: Report-Ready Patients
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role, statusFilter='examined') |
| **Duration** | ~6s |
| **Instruction** | Back as Jenny! The **Examined** tab shows patients whose EEGs have been reviewed. Notice Emily's card now shows the report created by Dr. Chen. Technicians finalize the workflow by sending reports to patients. |
| **UI** | TechnicianDashboard with statusFilter='examined'. Shows patient cards for Emily and Aisha (both have reports). |
| **Files** | `frontend/src/pages/TechnicianDashboard.tsx:27` — statusFilter |
| **Files** | `frontend/src/components/Patients.tsx:108-109` — filter state |

#### Step 5.1 — Mark Report Sent
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role) |
| **Duration** | ~5s |
| **Instruction** | Click **"Report Sent"** on Emily's card. This marks the report as delivered in the system and updates the patient's status. Emily moves to the "Report Sent" tab. |
| **UI** | Patient card shows "Report Sent" button. After clicking, the button text changes to "Sent" (disabled). Patient moves from "Examined" to "Report Sent" filter view. |
| **Highlight** | The "Report Sent" button. |
| **Files** | `frontend/src/components/Patients.tsx:1146-1157` — Report Sent button |
| **Files** | `backend/app/api/v1/endpoints/users.py:621-641` — POST /users/{id}/mark-report-sent |

#### Step 5.2 — Email Report to Patient
| Property | Value |
|---|---|
| **Route** | `/dashboard` (technician role) |
| **Duration** | ~6s |
| **Instruction** | Now click **"Email Report"** on Emily's card. This generates a secure portal link and emails it to the patient. The patient doesn't need to create an account — they just click the link in their email. A demo button will appear to simulate the patient's experience. |
| **UI** | Patient card shows "Email Report" button. After clicking, success feedback appears. Demo-only button appears below: |
| **Demo Button** | "Open Patient Portal (Emily) →" — Logout + navigate to `/patient/portal/{emily_portal_token}` (portal-demo-emily-001 from seed data). |
| **Highlight** | The "Email Report" button. |
| **Files** | `frontend/src/components/Patients.tsx:1158-1173` — Email Report button |
| **Files** | `backend/app/api/v1/endpoints/users.py:644-690` — POST /users/{id}/send-portal-email |
| **Files** | `backend/app/services/email_service.py:113-169` — send_patient_portal_email |
| **Files** | `backend/app/api/v1/endpoints/auth.py:536-581` — GET /patient-portal/{token} |

---

### PHASE 6: Patient Portal (~30 seconds)

#### Step 6.0 — Patient Portal Access (Token Exchange)
| Property | Value |
|---|---|
| **Route** | `/patient/portal/${token}` |
| **Duration** | ~5s |
| **Instruction** | This is what Emily sees when she clicks the link in her email. No login required — the secure token exchanges for a session automatically. The portal loads her reports. |
| **UI** | PatientPortalAccess component (loading spinner → token exchange → redirect). Brief flash of "Opening your portal…" then redirects to `/dashboard` as patient. |
| **Files** | `frontend/src/pages/PatientPortalAccess.tsx:8-49` — PatientPortalAccess |
| **Files** | `backend/app/api/v1/endpoints/auth.py:536-581` — patient portal token exchange |

#### Step 6.1 — Patient Portal: Reports & Bookmarks
| Property | Value |
|---|---|
| **Route** | `/dashboard` (patient role) |
| **Duration** | ~12s |
| **Instruction** | This is the **Patient Portal**. Emily can see her profile, latest report with clinical findings, EEG bookmarks saved by the doctor (useful for understanding the diagnosis visually), and all previous reports in chronological order. Click **"Download PDF"** to save the report locally. |
| **UI** | PatientPortal fully loaded. Shows:
- Patient Profile card (name, age, gender, blood group, phone, email, assigned doctor, member since)
- Latest Report card (file name, Normal/Abnormal chip, date, doctor name, indications, technique, factual report, impression, doctor notes)
- Download PDF button
- EEG Bookmarks section (2 bookmarks from Dr. Chen with images and comments)
- Previous Reports section (report id=5001 listed) |
| **Highlight** | The Latest Report "Normal/Abnormal" chip, then the "Download PDF" button, then the EEG Bookmarks section. |
| **Files** | `frontend/src/pages/PatientPortal.tsx:39-522` — full PatientPortal |
| **Files** | `frontend/src/pages/PatientPortal.tsx:216-267` — Patient Profile card |
| **Files** | `frontend/src/pages/PatientPortal.tsx:303-381` — Latest Report card |
| **Files** | `frontend/src/pages/PatientPortal.tsx:384-409` — EEG Bookmarks section |
| **Files** | `frontend/src/pages/PatientPortal.tsx:412-511` — Previous Reports section |
| **Files** | `frontend/src/pages/PatientPortal.tsx:109-124` — handleDownloadPDF |

#### Step 6.2 — Demo Complete
| Property | Value |
|---|---|
| **Route** | `/dashboard` (patient role) |
| **Duration** | ~8s |
| **Instruction** | 🎉 That's CereSignal in ~3 minutes! We've covered the complete workflow: **Admin setup → Technician patient management & EEG upload → AI processing → Doctor review & reporting → Report delivery → Patient portal**. Feel free to explore any section, or click **"Return to Start"** to begin again or sign up your own hospital. |
| **UI** | PatientPortal with completion overlay. Stats summary of the demo:
- 1 Hospital created
- 1 Admin, 1 Technician, 1 Doctor registered
- 3 Patients managed
- 2 Reports generated
- 1 Portal email sent |
| **Demo Button** | "🔄 Return to Start" → Logout + navigate to `/`. "🏥 Register Your Hospital" → Navigate to `/register/hospital`. |
| **Completion** | Demo mode persists until user explicitly exits or signs up for real. A small "Exit Demo" button in the corner allows exiting at any time. |

---

## Demo Mode Technical Design

### New Files to Create

| File | Purpose |
|---|---|
| `frontend/src/contexts/DemoContext.tsx` | Demo state machine: current step, demo mode flag, pre-seeded credentials, helper functions |
| `frontend/src/components/DemoGuide.tsx` | Floating instruction card with highlight overlays, "Next"/"Skip" buttons, step progress bar |
| `frontend/src/components/DemoButton.tsx` | Reusable demo action button styled with a distinct color (e.g., amber/orange accent) |
| `frontend/src/components/DemoAutofill.tsx` | Reusable autofill buttons for forms (login, registration, patient creation) |
| `backend/migrations/XXXX_demo_seed.sql` | SQL migration to insert pre-seeded data |
| `backend/scripts/seed_demo.py` | Python alternative for seeding (runs in CI or pre-deploy hook) |

### Files to Modify

| File | Changes |
|---|---|
| `frontend/src/App.tsx:198-211` | Wrap `<AppRoutes />` with `<DemoProvider>`. Pass demo state to route components. |
| `frontend/src/App.tsx:151-196` | Add `demoMode` check: disable auto-redirect from `/login` and `/register/*` when in demo mode so the demo can show those pages. |
| `frontend/src/pages/LandingPage.tsx` | Add "▶ Start Guided Demo" button to hero section. |
| `frontend/src/pages/LoginPage.tsx:179-209` | Add `DemoAutofill` component with 3 buttons (doctor, technician, patient) between form and "New to CereSignal?" divider. |
| `frontend/src/pages/HospitalSignupPage.tsx:288-312` | Add `DemoAutofill` button near the submit button. |
| `frontend/src/pages/AdminDashboard.tsx:334-375` | Add `DemoButton` (invite autofill). Add `DemoButton` after successful invite ("Go to Jenny's Invitation →"). |
| `frontend/src/pages/AdminDashboard.tsx:362-373` | After invite success, show demo transition button. |
| `frontend/src/pages/StaffInviteRegistrationPage.tsx:380-404` | Add `DemoAutofill` button near the submit button. |
| `frontend/src/pages/TechnicianDashboard.tsx:114-153` | Add `DemoButton` for phase transitions ("Show Full Workload →", "Continue as Jenny →"). |
| `frontend/src/pages/DoctorDashboard.tsx:240-298` | Add `DemoButton` for phase transition ("Continue as Jenny →"). |
| `frontend/src/components/Patients.tsx` | Support `demoMode` prop: show demo transition buttons, highlight elements on command. |
| `frontend/src/components/FileUpload.tsx` | Support `demoFileUrl` prop for auto-fetching a demo EDF file. |
| `frontend/src/pages/PatientPortal.tsx:136-519` | Add completion state (`demoComplete=true`) with summary overlay and "Return to Start" button. |

### DemoContext State Shape

```typescript
interface DemoState {
  isActive: boolean;           // Is demo mode currently running?
  currentStep: string;         // e.g., "0.1", "1.2", "4.3"
  currentPhase: number;        // 0-6
  steps: DemoStep[];           // All defined steps
  seededData: {
    hospitalId: number;
    adminCreds: { username: string; password: string };
    technicianCreds: { username: string; password: string };
    doctorCreds: { username: string; password: string };
    technicianInviteToken: string | null; // Set after admin sends invite
    patients: Array<{ id: number; portalToken: string }>;
  };
  advanceStep: () => void;     // Move to next step
  jumpToStep: (id: string) => void;
  endDemo: () => void;         // Exit demo mode
  isDemoMode: () => boolean;   // Shortcut check
}
```

### DemoGuide Component

A fixed-position floating card that:
1. Renders at the bottom-center or top-right of the viewport
2. Shows a step counter ("Step 3 of 18")
3. Shows the instruction text for the current step
4. Has "Skip" (to skip ahead faster) and "Next" buttons (or auto-advances when the user completes the action)
5. In "auto-highlight" mode, dims the rest of the page and highlights the target element

### CI Integration

The demo seed migration should be applied:
- On each push to the `demo` branch
- In the GitHub Actions CI workflow that deploys to the demo Supabase instance

Migration order:
1. Insert Hospital (id=1)
2. Insert AuthUsers (admin, technician, doctor) with bcrypt-hashed passwords
3. Insert StaffInvitations (2 records, used or pending depending on desired flow)
4. Insert Patients (Emily, James, Aisha) with portal tokens
5. Insert SignalFiles (4 records with completed status)
6. Insert EEGReports (2 records)
7. Insert EEGBookmarks (2 records)
8. Insert Notifications (3 records)

### Password Hashing for Seed Data

All demo passwords are `password`. The seed script must bcrypt-hash them using the same method as the backend:

```python
# backend/app/core/auth.py:8-9
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Generate hash:
hashed = pwd_context.hash("password")
```

### Demo EDF File

Include a small, valid EDF file in the repository (e.g., `demo/sample_eeg.edf`) that the demo can upload. The file should be:
- Small (< 1MB) for fast upload
- Valid EDF format with 19+ channels
- Representative of real EEG data

The `FileUpload` component in demo mode can either:
- Auto-fetch this file from a public URL in the demo assets
- Show a "Use Demo File" checkbox that auto-selects it

---

## Step Transition Map

```
Landing (/)
  │ [click "Start Demo"]
  ▼
PHASE 1: Admin
  Step 1.0  /register/hospital     → Autofill + register
  Step 1.1  /dashboard (admin)     → Dashboard intro
  Step 1.2  /dashboard (admin)     → Invite technician
  Step 1.3  /dashboard (admin)     → Post-invite, show "Go to Jenny" button
  Step 1.4  /register/invite/{t}   → Tech registration
  │
  ▼
PHASE 2: Technician (initial)
  Step 2.0  /dashboard (tech)      → Dashboard intro (empty)
  Step 2.1  /dashboard (tech)      → Add patient (Emily)
  Step 2.2  /dashboard (tech)      → Upload EEG file
  Step 2.3  /dashboard (tech)      → Processing status
  Step 2.4  /dashboard (tech)*     → "Show Full Workload" → reload with seed data
  │
  ▼
PHASE 3: Login transition
  Step 3.0  /login                 → Autofill doctor credentials
  │
  ▼
PHASE 4: Doctor
  Step 4.0  /dashboard (doctor)    → Dashboard intro, notifications
  Step 4.1  /dashboard (doctor)    → Open Emily's details
  Step 4.2  /dashboard (doctor)    → EEG viewer walkthrough
  Step 4.3  /dashboard (doctor)    → Create/Edit report
  Step 4.4  /dashboard (doctor)    → Version history, PDF download
  Step 4.5  /dashboard (doctor)    → Topomap, label buttons
  Step 4.6  /dashboard (doctor)    → "Continue as Jenny" button
  │
  ▼
PHASE 5: Technician (reports)
  Step 5.0  /dashboard (tech)      → Examined tab, see reports
  Step 5.1  /dashboard (tech)      → Mark report sent
  Step 5.2  /dashboard (tech)      → Email report + show portal button
  │
  ▼
PHASE 6: Patient Portal
  Step 6.0  /patient/portal/{t}   → Token exchange
  Step 6.1  /dashboard (patient)   → Portal: reports, bookmarks, download
  Step 6.2  /dashboard (patient)   → Demo complete summary
```

---

## File Reference Index

### Backend — API Endpoints

| Endpoint | File | Lines |
|---|---|---|
| `POST /auth/register/hospital` | `backend/app/api/v1/endpoints/auth.py` | 43-99 |
| `GET /auth/invite/{token}` | `backend/app/api/v1/endpoints/auth.py` | 101-123 |
| `POST /auth/register/invite/{token}` | `backend/app/api/v1/endpoints/auth.py` | 125-178 |
| `POST /auth/register` | `backend/app/api/v1/endpoints/auth.py` | 180-281 |
| `POST /auth/login` | `backend/app/api/v1/endpoints/auth.py` | 418-463 |
| `GET /auth/patient-portal/{token}` | `backend/app/api/v1/endpoints/auth.py` | 536-581 |
| `GET /auth/me` | `backend/app/api/v1/endpoints/auth.py` | 584-595 |
| `GET /auth/doctors` | `backend/app/api/v1/endpoints/auth.py` | 642-666 |
| `POST /admin/invite` | `backend/app/api/v1/endpoints/admin.py` | 35-86 |
| `GET /admin/stats` | `backend/app/api/v1/endpoints/admin.py` | 89-138 |
| `GET /admin/staff` | `backend/app/api/v1/endpoints/admin.py` | 140-151 |
| `GET /admin/invitations` | `backend/app/api/v1/endpoints/admin.py` | 173-182 |
| `POST /users/` | `backend/app/api/v1/endpoints/users.py` | 26-207 |
| `GET /users/` | `backend/app/api/v1/endpoints/users.py` | 209-275 |
| `POST /users/{id}/mark-report-sent` | `backend/app/api/v1/endpoints/users.py` | 621-641 |
| `POST /users/{id}/send-portal-email` | `backend/app/api/v1/endpoints/users.py` | 644-690 |
| `POST /signals/upload` | `backend/app/api/v1/endpoints/signals.py` | 89-520 |
| `GET /signals/files/{id}/inference-status` | `backend/app/api/v1/endpoints/signals.py` | 986-1063 |
| `GET /signals/files/{id}/report-status` | `backend/app/api/v1/endpoints/signals.py` | 1065-1135 |
| `GET /signals/files/{id}/plot-data` | `backend/app/api/v1/endpoints/signals.py` | 711-872 |
| `GET /signals/files/{id}/topomap` | `backend/app/api/v1/endpoints/signals.py` | 873-895 |
| `PATCH /signals/files/{id}/label` | `backend/app/api/v1/endpoints/signals.py` | 1194-1215 |
| `GET /signals/files/{id}/bookmarks` | `backend/app/api/v1/endpoints/signals.py` | 302-362 |
| `POST /signals/files/{id}/bookmarks` | `backend/app/api/v1/endpoints/signals.py` | 364-461 |
| `POST /reports/` | `backend/app/api/v1/endpoints/reports.py` | 63-159 |
| `GET /reports/` | `backend/app/api/v1/endpoints/reports.py` | 160-235 |
| `GET /reports/{id}/versions` | `backend/app/api/v1/endpoints/reports.py` | 370-409 |
| `POST /reports/{id}/versions/{vid}/restore` | `backend/app/api/v1/endpoints/reports.py` | 455-513 |
| `GET /reports/{id}/download-pdf` | `backend/app/api/v1/endpoints/reports.py` | 626-697 |
| `GET /notifications/` | `backend/app/api/v1/endpoints/notifications.py` | 19-40 |
| `POST /notifications/{id}/read` | `backend/app/api/v1/endpoints/notifications.py` | 42-52 |

### Backend — Models

| Model | File | Lines |
|---|---|---|
| `AuthUser` | `backend/app/models/auth.py` | 21-56 |
| `UserType` enum | `backend/app/models/auth.py` | 13-18 |
| `User` (patient) | `backend/app/models/user.py` | 12-63 |
| `Hospital` | `backend/app/models/hospital.py` | — |
| `StaffInvitation` | `backend/app/models/hospital.py` | — |
| `SignalFile` | `backend/app/models/signal.py` | — |
| `EEGReport` | `backend/app/models/report.py` | — |
| `EEGBookmark` | `backend/app/models/signal.py` | — |

### Backend — Core & Services

| File | Lines | Purpose |
|---|---|---|
| `backend/app/core/auth.py` | 1-142 | JWT creation/verification, password hashing, role guards |
| `backend/app/core/config.py` | 14-92 | Settings (SECRET_KEY, FRONTEND_URL, DESKTOP_MODE, etc.) |
| `backend/app/services/email_service.py` | 113-169 | `send_patient_portal_email()` |
| `backend/app/services/email_service.py` | 172-234 | `send_invitation_email()` |
| `backend/inference/infer.py` | 1-415 | Celery pipeline: NeuroGate + NeuroTransformer + LLM |

### Frontend — Pages

| Page | File | Lines | Purpose |
|---|---|---|---|
| `LandingPage` | `frontend/src/pages/LandingPage.tsx` | 1-384 | Add "Start Demo" button |
| `LoginPage` | `frontend/src/pages/LoginPage.tsx` | 1-304 | Add `DemoAutofill` buttons |
| `HospitalSignupPage` | `frontend/src/pages/HospitalSignupPage.tsx` | 46-95 | Add `DemoAutofill` button |
| `AdminDashboard` | `frontend/src/pages/AdminDashboard.tsx` | 1-437 | Add invite autofill + demo transition buttons |
| `StaffInviteRegistrationPage` | `frontend/src/pages/StaffInviteRegistrationPage.tsx` | 53-130 | Add `DemoAutofill` button |
| `TechnicianDashboard` | `frontend/src/pages/TechnicianDashboard.tsx` | 1-161 | Add demo transition buttons |
| `DoctorDashboard` | `frontend/src/pages/DoctorDashboard.tsx` | 1-303 | Add demo transition button |
| `DashboardPage` | `frontend/src/pages/DashboardPage.tsx` | 9-45 | Role routing (add demo awareness) |
| `PatientPortal` | `frontend/src/pages/PatientPortal.tsx` | 39-522 | Add completion summary overlay |
| `PatientPortalAccess` | `frontend/src/pages/PatientPortalAccess.tsx` | 8-49 | Token exchange (no demo changes needed) |

### Frontend — Components

| Component | File | Lines | Purpose |
|---|---|---|---|
| `Patients` | `frontend/src/components/Patients.tsx` | 54-1875 | Main patient CRUD + EEG viewer + report actions |
| `FileUpload` | `frontend/src/components/FileUpload.tsx` | 16-100 | File upload (add `demoFileUrl` support) |
| `EEGPlot` | `frontend/src/components/EEGPlot.tsx` | 51-803 | EEG viewer with Plotly.js |
| `ReportForm` | `frontend/src/components/ReportForm.tsx` | 44-778 | Report create/edit with AI polling |
| `ReportVersionHistory` | `frontend/src/components/ReportVersionHistory.tsx` | — | Version history + restore |
| `TopographicMap` | `frontend/src/components/TopographicMap.tsx` | — | Topomap display |

### Frontend — Services & Context

| File | Lines | Purpose |
|---|---|---|
| `frontend/src/services/api.ts` | 35-443 | API client with all endpoints |
| `frontend/src/contexts/AuthContext.tsx` | 31-166 | Auth state (login, logout, token management) |
| `frontend/src/App.tsx` | 134-211 | Router + ProtectedRoute + theme |

### Frontend — Types

| File | Lines | Purpose |
|---|---|---|
| `frontend/src/types/index.ts` | 1-401 | All TypeScript interfaces |

---

## Demo Implementation Checklist (For When You Build It)

- [ ] Create `DemoContext.tsx` with full state machine
- [ ] Create `DemoGuide.tsx` floating instruction component
- [ ] Create `DemoButton.tsx` and `DemoAutofill.tsx` components
- [ ] Create demo seed SQL migration (`backend/migrations/XXXX_demo_seed.sql`)
- [ ] Add demo EDF file to `demo/` or `public/` directory
- [ ] Modify `App.tsx` to wrap routes with `DemoProvider`
- [ ] Modify `App.tsx` ProtectedRoute to handle demo transitions (allow login/register pages in demo mode)
- [ ] Add "Start Demo" button to `LandingPage.tsx`
- [ ] Add `DemoAutofill` buttons to `LoginPage.tsx`
- [ ] Add `DemoAutofill` button to `HospitalSignupPage.tsx`
- [ ] Add demo invite autofill + transition buttons to `AdminDashboard.tsx`
- [ ] Add `DemoAutofill` button to `StaffInviteRegistrationPage.tsx`
- [ ] Add demo transition buttons to `TechnicianDashboard.tsx`
- [ ] Add demo transition button to `DoctorDashboard.tsx`
- [ ] Add completion summary + "Return to Start" to `PatientPortal.tsx`
- [ ] Add `demoMode` prop support to `Patients.tsx`
- [ ] Add `demoFileUrl` prop support to `FileUpload.tsx`
- [ ] Set `FRONTEND_URL` correctly for email link simulation
- [ ] Configure CI to apply seed migration on `demo` branch push
- [ ] Test full 3-minute flow end-to-end
- [ ] Add "Skip Step" / "Skip Phase" functionality to DemoGuide
- [ ] Add progress indicator (step X of 18) to DemoGuide
- [ ] Ensure logout clears demo state correctly during transitions
- [ ] Handle edge case: user refreshes during demo (persist step in sessionStorage)
