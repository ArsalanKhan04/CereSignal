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
    instruction: 'Welcome! This is the Admin Dashboard. Here you can see your hospital\'s key metrics. Now let\'s invite a technician to the workspace. Click the autofill button, select Technician, and send the invitation.',
  },
  {
    id: '1.2',
    phase: 1,
    route: '/dashboard',
    instruction: 'Invitation sent! ✅ Now click "Go to Technician\'s Registration →" to simulate what the technician sees when they click the email link.',
  },
  {
    id: '1.3',
    phase: 1,
    route: '/register/invite',
    instruction: 'This is what the technician sees when they click the email link. The email is pre-filled from the invitation. Use the autofill button, then click "Complete Registration".',
  },
  {
    id: '2.0',
    phase: 2,
    route: '/dashboard',
    instruction: 'Welcome! This is the Technician Dashboard. Technicians manage patient records, upload EEG files, assign patients to doctors, and send reports. Let\'s add a patient — click the "+ Add Patient" button.',
  },
  {
    id: '2.1',
    phase: 2,
    route: '/dashboard',
    instruction: 'Click "Add Normal Details" to autofill the form with random patient data and a normal EEG file. Then click "Save" to create the patient and start AI processing.',
  },
  {
    id: '2.2',
    phase: 2,
    route: '/dashboard',
    instruction: 'Good! Now let\'s add one more. Click "+ Add Patient" again, then click "Add Abnormal Details" this time. This patient has seizure indicators — the AI will detect these.',
  },
  {
    id: '2.3',
    phase: 2,
    route: '/dashboard',
    instruction: 'The EEG is processing. CereSignal\'s AI models analyze the signals (typically under 5 minutes). Watch the status chip change from "processing" to "completed".',
  },
  {
    id: '2.4',
    phase: 2,
    route: '/dashboard',
    instruction: 'Click "Show Full Workload →" to view all patients at different stages: pending review, examined, and report sent. Now let\'s add a doctor to review the EEGs.',
  },
  {
    id: '3.0',
    phase: 3,
    route: '/',
    instruction: 'Click "Continue as Admin →" to log out and return to the admin account. Then log in using the autofill button to add a doctor to the workspace.',
  },
  {
    id: '3.1',
    phase: 3,
    route: '/dashboard',
    instruction: 'Back in the Admin Dashboard. Now invite a doctor — click autofill, select Doctor as the role, and send the invitation.',
  },
  {
    id: '3.2',
    phase: 3,
    route: '/dashboard',
    instruction: 'Invitation sent! ✅ Click "Go to Doctor\'s Registration →" to switch to the doctor\'s registration view.',
  },
  {
    id: '3.3',
    phase: 3,
    route: '/register/invite',
    instruction: 'This is what the doctor sees. The email is pre-filled. Use the autofill button, then click "Complete Registration" to create the doctor account.',
  },
  {
    id: '4.0',
    phase: 4,
    route: '/dashboard',
    instruction: 'Welcome Doctor! This is your dashboard. Review the patients assigned to you, view their EEGs, and create clinical reports. Click on a patient card to get started.',
  },
  {
    id: '4.1',
    phase: 4,
    route: '/dashboard',
    instruction: 'This is the EEG viewer with Plotly.js. Explore channel groups, adjust sensitivity, scroll through time, and bookmark notable segments. When ready, create a report.',
  },
  {
    id: '4.2',
    phase: 4,
    route: '/dashboard',
    instruction: 'Click "Create Report". The form is pre-populated with AI-generated content: factual report, impression, and PDR values. Review, edit if needed, then save.',
  },
  {
    id: '4.3',
    phase: 4,
    route: '/dashboard',
    instruction: 'Reports support version history — every edit creates a snapshot. Click the history icon to view versions. When ready, download the report as PDF. Now let\'s switch back to the technician.',
  },
  {
    id: '5.0',
    phase: 5,
    route: '/',
    instruction: 'Click "Continue as Technician →" to log out and return to the technician account. The technician finalizes the workflow by sending the report to the patient.',
  },
  {
    id: '5.1',
    phase: 5,
    route: '/dashboard',
    instruction: 'Back as the technician! Find the patient with the completed report in the Examined tab. Click "Report Sent" to mark it as delivered, then click "Email Report" to send the portal link.',
  },
  {
    id: '5.2',
    phase: 5,
    route: '/dashboard',
    instruction: 'Email sent! ✅ The patient received a secure portal link. Now click "Open Patient Portal →" to see what the patient sees.',
  },
  {
    id: '6.0',
    phase: 6,
    route: '/patient/portal',
    instruction: 'This is the Patient Portal — no login required. The secure token from the email link authenticates automatically. The patient can view their report and download the PDF.',
  },
  {
    id: '6.1',
    phase: 6,
    route: '/dashboard',
    instruction: '🎉 That\'s CereSignal in a few minutes! We covered the complete workflow: Admin setup → Technician patient management & EEG upload → AI processing → Doctor review & reporting → Report delivery → Patient portal. Feel free to explore or click "Return to Start".',
  },
];

export interface DemoRuntimeData {
  suffix: string;
  hospitalName: string;
  adminUsername: string;
  adminPassword: string;
  techEmail: string;
  techUsername: string;
  techPassword: string;
  techInviteToken: string | null;
  docEmail: string;
  docUsername: string;
  docPassword: string;
  docInviteToken: string | null;
  portalToken: string | null;
}

const RUNTIME_KEY = 'ceresignal_demo_runtime';

function generateRuntimeData(): DemoRuntimeData {
  const suffix = Math.random().toString(36).substring(2, 6);
  return {
    suffix,
    hospitalName: `CereSignal Demo ${suffix.toUpperCase()}`,
    adminUsername: `admin_${suffix}`,
    adminPassword: 'Demo@2025!',
    techEmail: `tech.${suffix}@demo.local`,
    techUsername: `tech_${suffix}`,
    techPassword: 'Demo@2025!',
    techInviteToken: null,
    docEmail: `doc.${suffix}@demo.local`,
    docUsername: `doc_${suffix}`,
    docPassword: 'Demo@2025!',
    docInviteToken: null,
    portalToken: null,
  };
}

interface DemoContextValue {
  isActive: boolean;
  currentStepId: string;
  currentPhase: number;
  currentStep: DemoStep | undefined;
  demoData: DemoRuntimeData;
  setDemoData: (updater: (prev: DemoRuntimeData) => DemoRuntimeData) => void;
  startDemo: () => void;
  advanceStep: () => void;
  retreatStep: () => void;
  jumpToStep: (id: string) => void;
  endDemo: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const SESSION_KEY = 'ceresignal_demo_step';

function loadRuntimeData(): DemoRuntimeData {
  try {
    const raw = sessionStorage.getItem(RUNTIME_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return generateRuntimeData();
}

export const DemoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) !== null;
  });
  const [currentStepId, setCurrentStepId] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) ?? '0.1';
  });
  const [demoData, setDemoDataState] = useState<DemoRuntimeData>(loadRuntimeData);

  const currentStep = DEMO_STEPS.find((s) => s.id === currentStepId);
  const currentPhase = currentStep?.phase ?? 0;

  const persistStep = useCallback((id: string) => {
    sessionStorage.setItem(SESSION_KEY, id);
    setCurrentStepId(id);
  }, []);

  const setDemoData = useCallback((updater: (prev: DemoRuntimeData) => DemoRuntimeData) => {
    setDemoDataState((prev) => {
      const next = updater(prev);
      sessionStorage.setItem(RUNTIME_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const startDemo = useCallback(() => {
    const fresh = generateRuntimeData();
    sessionStorage.setItem(RUNTIME_KEY, JSON.stringify(fresh));
    setDemoDataState(fresh);
    setIsActive(true);
    persistStep('1.0');
  }, [persistStep]);

  const advanceStep = useCallback(() => {
    const idx = DEMO_STEPS.findIndex((s) => s.id === currentStepId);
    if (idx >= 0 && idx < DEMO_STEPS.length - 1) {
      persistStep(DEMO_STEPS[idx + 1].id);
    }
  }, [currentStepId, persistStep]);

  const retreatStep = useCallback(() => {
    const idx = DEMO_STEPS.findIndex((s) => s.id === currentStepId);
    if (idx > 0) {
      persistStep(DEMO_STEPS[idx - 1].id);
    }
  }, [currentStepId, persistStep]);

  const jumpToStep = useCallback((id: string) => {
    persistStep(id);
  }, [persistStep]);

  const endDemo = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RUNTIME_KEY);
    setIsActive(false);
    setCurrentStepId('0.1');
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
        demoData,
        setDemoData,
        startDemo,
        advanceStep,
        retreatStep,
        jumpToStep,
        endDemo,
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
