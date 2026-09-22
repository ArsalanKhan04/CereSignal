/**
 * Route guards in App.tsx: who is let into /dashboard and /dev-admin, and where a
 * signed-in user is bounced from the public pages.
 *
 * The pages behind each route are replaced with labelled stubs. This file is about
 * which route renders, not what the page does, and the real dashboards each fire
 * their own set of requests. The auth state is still real: AuthProvider resolves
 * the stored token through /auth/me on the mocked axios instance, exactly as it
 * does in the browser.
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from './App';
import { AuthProvider } from './contexts/AuthContext';
import { DemoProvider } from './contexts/DemoContext';
import apiClient from './services/api';

jest.mock('./pages/LoginPage', () => () => <div>LOGIN PAGE</div>);
jest.mock('./pages/DashboardPage', () => () => <div>DASHBOARD PAGE</div>);
jest.mock('./pages/HospitalSignupPage', () => () => <div>HOSPITAL SIGNUP</div>);
jest.mock('./pages/PatientPortalAccess', () => () => <div>PORTAL ACCESS</div>);
jest.mock('./pages/DesktopWorkspace', () => () => <div>DESKTOP WORKSPACE</div>);
jest.mock('./pages/dev-admin/DevAdminLayout', () => {
  const { Outlet } = require('react-router-dom');
  return () => (
    <div>
      DEV ADMIN LAYOUT
      <Outlet />
    </div>
  );
});
jest.mock('./pages/dev-admin/DevAdminDashboard', () => () => <div>DEV ADMIN HOME</div>);
jest.mock('./pages/dev-admin/DevAdminHospitals', () => () => <div>DEV ADMIN HOSPITALS</div>);

const DOCTOR = { id: 1, username: 'doc', user_type: 'doctor', is_superuser: false };
const SUPERUSER = { id: 2, username: 'root', user_type: 'admin', is_superuser: true };

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
});

afterEach(() => {
  mock.restore();
  delete (window as any).electron;
});

function WhereAmI() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function signInAs(user: object) {
  window.localStorage.setItem('auth_token', 'stored-token');
  mock.onGet('/auth/me').reply(200, user);
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DemoProvider>
        <AuthProvider>
          <AppRoutes />
          <WhereAmI />
        </AuthProvider>
      </DemoProvider>
    </MemoryRouter>,
  );

describe('signed out', () => {
  it('shows the login page at /', async () => {
    renderAt('/');
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('sends /dashboard back to the login page', async () => {
    renderAt('/dashboard');

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('sends /dev-admin back to the login page', async () => {
    renderAt('/dev-admin/hospitals');

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText(/DEV ADMIN/)).not.toBeInTheDocument();
  });

  it('treats a token /auth/me rejects as signed out, and clears it', async () => {
    window.localStorage.setItem('auth_token', 'expired');
    mock.onGet('/auth/me').reply(401);

    renderAt('/dashboard');

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(window.localStorage.getItem('auth_token')).toBeNull();
  });

  it('keeps the patient portal link public', async () => {
    renderAt('/patient/portal/some-token');
    expect(await screen.findByText('PORTAL ACCESS')).toBeInTheDocument();
  });

  it('redirects the legacy /signup and /login paths', async () => {
    renderAt('/signup');
    expect(await screen.findByText('HOSPITAL SIGNUP')).toBeInTheDocument();
  });
});

describe('signed in as staff', () => {
  beforeEach(() => signInAs(DOCTOR));

  it('lets a doctor into the dashboard', async () => {
    renderAt('/dashboard');
    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument();
  });

  it('moves a doctor off the login page to the dashboard', async () => {
    renderAt('/');

    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/dashboard');
  });

  it('moves a doctor off the signup page too', async () => {
    renderAt('/register/hospital');
    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument();
  });

  it('keeps a non-superuser out of dev-admin', async () => {
    renderAt('/dev-admin');

    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument();
    expect(screen.queryByText(/DEV ADMIN/)).not.toBeInTheDocument();
  });
});

describe('signed in as a superuser', () => {
  beforeEach(() => signInAs(SUPERUSER));

  it('lands on dev-admin rather than the dashboard', async () => {
    renderAt('/');

    expect(await screen.findByText('DEV ADMIN HOME')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/dev-admin');
  });

  it('reaches the nested dev-admin pages', async () => {
    renderAt('/dev-admin/hospitals');
    expect(await screen.findByText('DEV ADMIN HOSPITALS')).toBeInTheDocument();
  });
});

describe('desktop app', () => {
  it('renders the workspace once the desktop session is up', async () => {
    (window as any).electron = { desktopSecret: 'launch-secret' };
    mock.onPost('/auth/desktop-session').reply(200, { access_token: 'desk-token' });
    mock.onGet('/auth/me').reply(200, DOCTOR);

    renderAt('/');

    expect(await screen.findByText('DESKTOP WORKSPACE')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });

  it('says so when the session exchange fails, instead of showing a login form', async () => {
    (window as any).electron = { desktopSecret: 'launch-secret' };
    mock.onPost('/auth/desktop-session').reply(404);

    renderAt('/');

    expect(await screen.findByText(/Could not start the desktop session/)).toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });
});
