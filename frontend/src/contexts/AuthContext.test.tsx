/**
 * Tests for AuthContext — the single place the app decides whether someone is
 * signed in and who they are.
 *
 * Driven through the real axios instance (via axios-mock-adapter) rather than by
 * mocking apiClient, so the token actually round-trips through localStorage and
 * the request interceptor, exactly as it does in the browser.
 */

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import apiClient from '../services/api';

const DOCTOR = { id: 1, username: 'doctor_a', user_type: 'doctor', email: 'd@a.test' };

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
});

afterEach(() => {
  mock.restore();
});

function Probe() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [failed, setFailed] = React.useState(false);
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="who">{user?.username ?? 'nobody'}</span>
      <span data-testid="failed">{String(failed)}</span>
      {/* A real form catches and renders the failure; swallowing it here keeps the
          rejection from surfacing as an unhandled promise. */}
      <button
        onClick={() =>
          login({ username: 'doctor_a', password: 'pw' } as any).catch(() => setFailed(true))
        }
      >
        sign in
      </button>
      <button onClick={logout}>sign out</button>
    </div>
  );
}

const renderProbe = () => render(<AuthProvider><Probe /></AuthProvider>);

describe('startup', () => {
  it('stays signed out when there is no stored token', async () => {
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
  });

  it('restores the session from a stored token', async () => {
    window.localStorage.setItem('auth_token', 'stored');
    mock.onGet('/auth/me').reply(200, DOCTOR);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('doctor_a'));
    expect(screen.getByTestId('authed')).toHaveTextContent('true');
  });

  it('clears a stored token the server rejects', async () => {
    window.localStorage.setItem('auth_token', 'expired');
    mock.onGet('/auth/me').reply(401);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(window.localStorage.getItem('auth_token')).toBeNull();
  });

  it('finishes loading even when the server is unreachable', async () => {
    window.localStorage.setItem('auth_token', 'stored');
    mock.onGet('/auth/me').networkError();

    renderProbe();

    // A spinner that never stops is worse than an error.
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
  });
});

describe('login', () => {
  it('stores the token and the user', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(200, { access_token: 'fresh-token', token_type: 'bearer' });
    mock.onGet('/auth/me').reply(200, DOCTOR);

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByRole('button', { name: 'sign in' }));

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    expect(window.localStorage.getItem('auth_token')).toBe('fresh-token');
    expect(JSON.parse(window.localStorage.getItem('current_user')!)).toEqual(DOCTOR);
  });

  it('sends the new token on the follow-up /auth/me call', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(200, { access_token: 'fresh-token', token_type: 'bearer' });
    mock.onGet('/auth/me').reply(200, DOCTOR);

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByRole('button', { name: 'sign in' }));

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    const meCall = mock.history.get.find((r) => r.url === '/auth/me');
    expect(meCall?.headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('leaves the user signed out when the credentials are wrong', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(401, { detail: 'Incorrect username or password' });

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    await user.click(screen.getByRole('button', { name: 'sign in' }));

    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));
    expect(screen.getByTestId('authed')).toHaveTextContent('false');
    expect(window.localStorage.getItem('auth_token')).toBeNull();
  });
});

describe('logout', () => {
  it('drops both the user and the stored credentials', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('auth_token', 'stored');
    window.localStorage.setItem('current_user', JSON.stringify(DOCTOR));
    mock.onGet('/auth/me').reply(200, DOCTOR);

    renderProbe();
    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('true'));
    await user.click(screen.getByRole('button', { name: 'sign out' }));

    await waitFor(() => expect(screen.getByTestId('authed')).toHaveTextContent('false'));
    expect(window.localStorage.getItem('auth_token')).toBeNull();
    expect(window.localStorage.getItem('current_user')).toBeNull();
  });
});

describe('useAuth outside a provider', () => {
  it('throws rather than silently returning undefined', () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow(/useAuth must be used within an AuthProvider/);

    quiet.mockRestore();
  });
});
