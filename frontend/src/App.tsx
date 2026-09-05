import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DemoProvider, useDemo } from './contexts/DemoContext';
import { ConfigProvider } from './contexts/ConfigContext';
import DemoGuide from './components/DemoGuide';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ContactPage from './pages/ContactPage';
import SignupPage from './pages/SignupPage';
import DoctorRegistrationPage from './pages/DoctorRegistrationPage';
import TechnicianRegistrationPage from './pages/TechnicianRegistrationPage';
import DashboardPage from './pages/DashboardPage';
import HospitalSignupPage from './pages/HospitalSignupPage';
import StaffInviteRegistrationPage from './pages/StaffInviteRegistrationPage';
import PatientPortalAccess from './pages/PatientPortalAccess';
import DevAdminLayout from './pages/dev-admin/DevAdminLayout';
import DevAdminDashboard from './pages/dev-admin/DevAdminDashboard';
import DevAdminHospitals from './pages/dev-admin/DevAdminHospitals';
import DevAdminHospitalDetail from './pages/dev-admin/DevAdminHospitalDetail';
import DevAdminContacts from './pages/dev-admin/DevAdminContacts';
import './App.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#2563eb', // Professional blue
      light: '#3b82f6',
      dark: '#1e40af',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#64748b', // Neutral gray
      light: '#94a3b8',
      dark: '#475569',
    },
    background: {
      default: '#f8fafc', // Very light gray background
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b', // Dark gray for text
      secondary: '#64748b', // Medium gray for secondary text
    },
    grey: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
  },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2rem',
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 600,
      fontSize: '1.5rem',
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.125rem',
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: '0.01em',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            fontSize: '0.9375rem',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#cbd5e1',
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 24px',
          fontSize: '0.9375rem',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        },
        elevation3: {
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        },
      },
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

const SuperuserRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!user?.is_superuser) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isActive: isDemoActive } = useDemo();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // During demo mode, don't auto-redirect away from registration/login pages
  const authenticatedRedirect = isAuthenticated && !isDemoActive
    ? user?.is_superuser
      ? '/dev-admin'
      : '/dashboard'
    : null;

  return (
    <>
    <DemoGuide />
    <Routes>
      <Route
        path="/"
        element={authenticatedRedirect ? <Navigate to={authenticatedRedirect} replace /> : <LoginPage />}
      />
      <Route
        path="/login"
        element={<Navigate to="/" replace />}
      />
      <Route
        path="/landing"
        element={<LandingPage />}
      />
      <Route
        path="/contact"
        element={<ContactPage />}
      />
      <Route
        path="/signup"
        element={<Navigate to="/register/hospital" replace />}
      />
      <Route
        path="/register/hospital"
        element={authenticatedRedirect ? <Navigate to={authenticatedRedirect} replace /> : <HospitalSignupPage />}
      />
      <Route
        path="/register/invite/:token"
        element={authenticatedRedirect ? <Navigate to={authenticatedRedirect} replace /> : <StaffInviteRegistrationPage />}
      />
      <Route path="/patient/portal/:token" element={<PatientPortalAccess />} />
      <Route
        path="/register/doctor"
        element={authenticatedRedirect ? <Navigate to={authenticatedRedirect} replace /> : <DoctorRegistrationPage />}
      />
      <Route
        path="/register/technician"
        element={authenticatedRedirect ? <Navigate to={authenticatedRedirect} replace /> : <TechnicianRegistrationPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dev-admin"
        element={
          <SuperuserRoute>
            <DevAdminLayout />
          </SuperuserRoute>
        }
      >
        <Route index element={<DevAdminDashboard />} />
        <Route path="hospitals" element={<DevAdminHospitals />} />
        <Route path="hospitals/:id" element={<DevAdminHospitalDetail />} />
        <Route path="contacts" element={<DevAdminContacts />} />
      </Route>
    </Routes>
    </>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConfigProvider>
        <DemoProvider>
          <AuthProvider>
            <Router>
              <AppRoutes />
            </Router>
          </AuthProvider>
        </DemoProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
};

export default App;
