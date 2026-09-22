/**
 * The patient's only way in: the emailed /patient/portal/:token link, exchanged for a
 * JWT at GET /auth/patient-portal/{token}. A bad link must stay on the error and
 * store nothing.
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PatientPortalAccess from './PatientPortalAccess';
import { AuthProvider } from '../contexts/AuthContext';
import apiClient from '../services/api';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
});

afterEach(() => mock.restore());

const renderAt = (token: string) =>
  render(
    <MemoryRouter initialEntries={[`/patient/portal/${token}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/patient/portal/:token" element={<PatientPortalAccess />} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          <Route path="/" element={<div>LOGIN</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

it('exchanges the token, stores the JWT and opens the dashboard', async () => {
  mock.onGet('/auth/patient-portal/good-token').reply(200, { access_token: 'patient-jwt' });
  mock.onGet('/auth/me').reply(200, { id: 9, username: 'p', user_type: 'patient' });

  renderAt('good-token');

  expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
  expect(window.localStorage.getItem('auth_token')).toBe('patient-jwt');
  await waitFor(() => expect(mock.history.get.some((r) => r.url === '/auth/me')).toBe(true));
});

it('shows the server detail for a rejected link and stores nothing', async () => {
  mock.onGet('/auth/patient-portal/bad').reply(404, { detail: 'Portal link not found' });

  renderAt('bad');

  expect(await screen.findByText('Portal link not found')).toBeInTheDocument();
  expect(window.localStorage.getItem('auth_token')).toBeNull();
  expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
});

it('falls back to a generic message when the server gives no detail', async () => {
  mock.onGet('/auth/patient-portal/bad').networkError();

  renderAt('bad');

  expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
});

it('offers a way back to the login page', async () => {
  const user = userEvent.setup();
  mock.onGet('/auth/patient-portal/bad').reply(404, { detail: 'nope' });
  renderAt('bad');

  await user.click(await screen.findByRole('button', { name: /back to login/i }));

  expect(screen.getByText('LOGIN')).toBeInTheDocument();
});
