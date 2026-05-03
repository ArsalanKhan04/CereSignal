import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface DemoStep {
  id: string;
  phase: number;
  route: string;
  instruction: string;
  highlightTargets?: string[];
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: '0.1',
    phase: 0,
    route: '/',
    instruction: 'Welcome to CereSignal — an AI-powered EEG analysis and clinical reporting platform. We\'ll walk you through the complete workflow in just a few minutes. Click "Start Demo" to begin.',
  },
  {
    id: '1.0',
    phase: 1,
    route: '/register/hospital',
    instruction: 'Every CereSignal workspace starts with a hospital. An admin account is created alongside it. Use the demo autofill button to pre-populate the form, then click "Create Hospital Workspace".',
  },
  {
    id: '1.1',
    phase: 1,
    route: '/dashboard',
    instruction: 'Welcome Sarah! This is the Admin Dashboard. Here you can see your hospital\'s key metrics: active doctors, technicians, total patients, and pending reports. Below you manage your staff and send invitations.',
  },
  {
    id: '1.2',
    phase: 1,
    route: '/dashboard',
    instruction: 'Let\'s invite a technician. Type jenny.tech@demo.local in the email field (or click autofill), select Technician as the role, and click "Send Invitation".',
  },
  {
    id: '1.3',
    phase: 1,
    route: '/dashboard',
    instruction: 'Invitation sent! ✅ Jenny received an email with a registration link. Click "Go to Jenny\'s Invitation →" below to simulate clicking that email link.',
  },
  {
    id: '1.4',
    phase: 1,
    route: '/register/invite',
    instruction: 'This is what Jenny sees when she clicks the email link. The form recognizes the invitation and pre-fills the email. Use the autofill button, then click "Complete Registration".',
  },
  {
    id: '2.0',
    phase: 2,
    route: '/dashboard',
    instruction: 'Welcome Jenny! This is the Technician Dashboard. Technicians manage patient records, upload EEG files, assign patients to doctors, and send reports. Currently there are no patients — let\'s add one.',
  },
  {
    id: '2.1',
    phase: 2,
    route: '/dashboard',
    instruction: 'Click the "+ Add Patient" button. Fill in the patient details using the autofill button, then click "Save". In a real clinic, you\'d also assign a doctor from the dropdown.',
  },
  {
    id: '2.2',
    phase: 2,
    route: '/dashboard',
    instruction: 'After saving, Emily\'s patient card appears. Now click "Upload EEG File" on her card. This triggers the AI pipeline: EDF parsing → NeuroGate classification → NeuroTransformer analysis → Topomap generation → LLM report drafting.',
  },
  {
    id: '2.3',
    phase: 2,
    route: '/dashboard',
    instruction: 'The EEG is processing. CereSignal\'s AI models analyze the signals in about 15-30 seconds. Watch the status chip change from "processing" to "completed". The other tabs — Examined and Report Sent — show patients at different workflow stages.',
  },
  {
    id: '2.4',
    phase: 2,
    route: '/dashboard',
    instruction: 'Jenny often manages multiple patients. Click "Show Full Workload →" to view all her patients at different stages: pending review, examined, and report sent.',
  },
  {
    id: '3.0',
    phase: 3,
    route: '/login',
    instruction: 'Now let\'s see the doctor\'s perspective. Notice the demo autofill buttons on the login page. Click "🔑 Login as Dr. David Chen" to auto-fill the doctor credentials, then click "Sign In".',
  },
  {
    id: '4.0',
    phase: 4,
    route: '/dashboard',
    instruction: 'Welcome Dr. Chen! Notice the notification bell 🔔 with 3 unread alerts — these tell you when new patients are assigned and when reports are ready. The toggle lets you switch between "Assigned to me" and "All patients". 2 patients are pending your review.',
  },
  {
    id: '4.1',
    phase: 4,
    route: '/dashboard',
    instruction: 'Click on Emily Richardson\'s patient card to open the full detail view. Here you can see her profile, EEG files, and processing results. Notice the "View EEG" and "Normal / Abnormal" label buttons.',
  },
  {
    id: '4.2',
    phase: 4,
    route: '/dashboard',
    instruction: 'This is the EEG viewer with Plotly.js. Key features: (1) Channel groups — toggle between bipolar montage, average reference. (2) Sensitivity slider — zoom in/out. (3) Time navigation — scroll through the recording. (4) Bookmarks — save notable segments.',
  },
  {
    id: '4.3',
    phase: 4,
    route: '/dashboard',
    instruction: 'After reviewing the EEG, click "Create Report" (or "Edit Report" if one exists). The form is pre-populated with AI-generated content: factual report text, impression, and PDR values. Review, edit if needed, then click "Save Report".',
  },
  {
    id: '4.4',
    phase: 4,
    route: '/dashboard',
    instruction: 'Reports support version history — every edit creates a snapshot you can restore later. Click the history icon to view versions. When ready, click "Download Report" to generate and download the PDF.',
  },
  {
    id: '4.5',
    phase: 4,
    route: '/dashboard',
    instruction: 'Other powerful features include the Topographic Map — a heatmap of brain activity across the scalp, automatically generated from EEG data. Doctors can also mark files as Normal or Abnormal with a single click using the label buttons.',
  },
  {
    id: '4.6',
    phase: 4,
    route: '/dashboard',
    instruction: 'Great work! Dr. Chen has completed his review. Now let\'s switch back to the technician\'s view to send the report to the patient. Click "Continue as Jenny (Technician) →" below.',
  },
  {
    id: '5.0',
    phase: 5,
    route: '/dashboard',
    instruction: 'Back as Jenny! The Examined tab shows patients whose EEGs have been reviewed. Notice Emily\'s card now shows the report created by Dr. Chen. Technicians finalize the workflow by sending reports to patients.',
  },
  {
    id: '5.1',
    phase: 5,
    route: '/dashboard',
    instruction: 'Click "Report Sent" on Emily\'s card. This marks the report as delivered in the system and updates the patient\'s status. Emily moves to the "Report Sent" tab.',
  },
  {
    id: '5.2',
    phase: 5,
    route: '/dashboard',
    instruction: 'Now click "Email Report" on Emily\'s card. This generates a secure portal link and emails it to the patient. The patient doesn\'t need to create an account — they just click the link in their email.',
  },
  {
    id: '6.0',
    phase: 6,
    route: '/patient/portal',
    instruction: 'This is what Emily sees when she clicks the link in her email. No login required — the secure token exchanges for a session automatically. The portal loads her reports.',
  },
  {
    id: '6.1',
    phase: 6,
    route: '/dashboard',
    instruction: 'This is the Patient Portal. Emily can see her profile, latest report with clinical findings, EEG bookmarks saved by the doctor (useful for understanding the diagnosis visually), and all previous reports. Click "Download PDF" to save the report.',
  },
  {
    id: '6.2',
    phase: 6,
    route: '/dashboard',
    instruction: '🎉 That\'s CereSignal in ~3 minutes! We\'ve covered the complete workflow: Admin setup → Technician patient management & EEG upload → AI processing → Doctor review & reporting → Report delivery → Patient portal. Feel free to explore or click "Return to Start" to begin again.',
  },
];

export interface DemoSeededData {
  hospitalId: number;
  adminCreds: { username: string; password: string };
  technicianCreds: { username: string; password: string };
  doctorCreds: { username: string; password: string };
  technicianInviteToken: string | null;
  patients: Array<{ id: number; portalToken: string }>;
}

const DEFAULT_SEEDED_DATA: DemoSeededData = {
  hospitalId: 1,
  adminCreds: { username: 'admin_nl', password: 'Demo@2025!' },
  technicianCreds: { username: 'jenny_tech', password: 'Demo@2025!' },
  doctorCreds: { username: 'dr_chen', password: 'Demo@2025!' },
  technicianInviteToken: null,
  patients: [
    { id: 1, portalToken: 'portal-demo-emily-001' },
    { id: 2, portalToken: 'portal-demo-james-002' },
    { id: 3, portalToken: 'portal-demo-aisha-003' },
  ],
};

interface DemoContextValue {
  isActive: boolean;
  currentStepId: string;
  currentPhase: number;
  currentStep: DemoStep | undefined;
  seededData: DemoSeededData;
  startDemo: () => void;
  advanceStep: () => void;
  jumpToStep: (id: string) => void;
  endDemo: () => void;
  setTechnicianInviteToken: (token: string) => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const SESSION_KEY = 'ceresignal_demo_step';

export const DemoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) !== null;
  });
  const [currentStepId, setCurrentStepId] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) ?? '0.1';
  });
  const [seededData, setSeededData] = useState<DemoSeededData>(DEFAULT_SEEDED_DATA);

  const currentStep = DEMO_STEPS.find((s) => s.id === currentStepId);
  const currentPhase = currentStep?.phase ?? 0;

  const persistStep = useCallback((id: string) => {
    sessionStorage.setItem(SESSION_KEY, id);
    setCurrentStepId(id);
  }, []);

  const startDemo = useCallback(() => {
    setIsActive(true);
    persistStep('1.0');
  }, [persistStep]);

  const advanceStep = useCallback(() => {
    const idx = DEMO_STEPS.findIndex((s) => s.id === currentStepId);
    if (idx >= 0 && idx < DEMO_STEPS.length - 1) {
      persistStep(DEMO_STEPS[idx + 1].id);
    }
  }, [currentStepId, persistStep]);

  const jumpToStep = useCallback((id: string) => {
    persistStep(id);
  }, [persistStep]);

  const endDemo = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsActive(false);
    setCurrentStepId('0.1');
  }, []);

  const setTechnicianInviteToken = useCallback((token: string) => {
    setSeededData((prev) => ({ ...prev, technicianInviteToken: token }));
  }, []);

  useEffect(() => {
    if (isActive) {
      sessionStorage.setItem(SESSION_KEY, currentStepId);
    }
  }, [isActive, currentStepId]);

  return (
    <DemoContext.Provider
      value={{
        isActive,
        currentStepId,
        currentPhase,
        currentStep,
        seededData,
        startDemo,
        advanceStep,
        jumpToStep,
        endDemo,
        setTechnicianInviteToken,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
};

export const useDemo = (): DemoContextValue => {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within DemoProvider');
  return ctx;
};
