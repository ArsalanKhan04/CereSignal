/**
 * Tests for LoginPage.
 *
 * This closes the loop the validation suite leaves open. src/utils/validation.ts
 * is thoroughly tested as pure functions, but nothing checked that the login form
 * actually wires those validators to the right fields, or that a rejected login
 * *shows* the failure instead of announcing success and navigating away.
 *
 * Rendered with the real AuthProvider over a mocked axios instance, so the
 * submit path runs the same code it does in the browser.
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage';
import { AuthProvider } from '../contexts/AuthContext';
import { DemoProvider } from '../contexts/DemoContext';
import apiClient from '../services/api';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
});

afterEach(() => mock.restore());

/**
 * Rendered with real routing rather than a mocked useNavigate: jest.requireActual
 * on react-router-dom bypasses the moduleNameMapper in package.json and fails to
 * resolve. Asserting that the dashboard route renders is a truer check anyway.
 */
const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <DemoProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          </Routes>
        </AuthProvider>
      </DemoProvider>
    </MemoryRouter>,
  );

const fields = () => ({
  username: screen.getByLabelText(/username/i),
  password: screen.getByLabelText(/password/i),
  submit: screen.getByRole('button', { name: /sign in/i }),
});

describe('rendering', () => {
  it('shows the credential fields and a submit button', () => {
    renderLogin();

    const { username, password, submit } = fields();
    expect(username).toBeInTheDocument();
    expect(password).toBeInTheDocument();
    expect(submit).toBeInTheDocument();
  });
});

describe('client-side validation', () => {
  it('does not call the API when both fields are empty', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(fields().submit);

    // Both fields go invalid and nothing is sent to the server.
    await waitFor(() => expect(fields().username).toBeInvalid());
    expect(fields().password).toBeInvalid();
    expect(mock.history.post).toHaveLength(0);
  });

  it('rejects a too-short password without asking the server', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(fields().username, 'doctor_a');
    await user.type(fields().password, 'abc');
    await user.click(fields().submit);

    await waitFor(() => expect(mock.history.post).toHaveLength(0));
  });
});

describe('submitting valid credentials', () => {
  it('navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(200, { access_token: 't', token_type: 'bearer' });
    mock.onGet('/auth/me').reply(200, { id: 1, username: 'doctor_a', user_type: 'doctor' });
    renderLogin();

    await user.type(fields().username, 'doctor_a');
    await user.type(fields().password, 'testpass123');
    await user.click(fields().submit);

    await screen.findByText('DASHBOARD');
  });

  it('shows the failure and stays put when the credentials are wrong', async () => {
    // The house rule: show the error rather than announce a success that did not happen.
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(401, { detail: 'Incorrect username or password' });
    renderLogin();

    await user.type(fields().username, 'doctor_a');
    await user.type(fields().password, 'wrongpassword');
    await user.click(fields().submit);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/incorrect username or password/i);
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the server explains nothing', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(500);
    renderLogin();

    await user.type(fields().username, 'doctor_a');
    await user.type(fields().password, 'testpass123');
    await user.click(fields().submit);

    // extractApiErrors supplies this wording when the response carries no detail.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/unexpected error/i),
    );
  });

  it('re-enables the button after a failure so the user can retry', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/login').reply(401, { detail: 'Incorrect username or password' });
    renderLogin();

    await user.type(fields().username, 'doctor_a');
    await user.type(fields().password, 'wrongpassword');
    await user.click(fields().submit);

    await screen.findByRole('alert');
    expect(fields().submit).toBeEnabled();
  });
});
