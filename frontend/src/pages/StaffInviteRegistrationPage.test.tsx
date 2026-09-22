/**
 * Staff onboarding from an emailed /register/invite/:token link. Both calls carry the
 * token in the body (POST /auth/invite/validate, POST /auth/register/invite) so it
 * never reaches a request log.
 *
 * Two halves: the token check (a used, expired, unknown or merely unreachable
 * invitation each say something different, and a server failure must not claim the
 * link is bad), then the form (validation keeps a bad submission off the wire,
 * success registers and signs in, a 422 lands on the right field).
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffInviteRegistrationPage from './StaffInviteRegistrationPage';
import { AuthProvider } from '../contexts/AuthContext';
import { DemoProvider } from '../contexts/DemoContext';
import apiClient from '../services/api';

const INVITE = { email: 'new.doc@example.com', role: 'doctor', hospital_name: 'General', hospital_id: 1 };

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
});

afterEach(() => mock.restore());

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/register/invite/tok']}>
      <DemoProvider>
        <AuthProvider>
          <Routes>
            <Route path="/register/invite/:token" element={<StaffInviteRegistrationPage />} />
            <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          </Routes>
        </AuthProvider>
      </DemoProvider>
    </MemoryRouter>,
  );

describe('invitation token', () => {
  it.each([
    [410, { detail: 'Invitation has already been used' }, /already been used/],
    [410, { detail: 'Invitation expired' }, /has expired/],
    [404, { detail: 'Not found' }, /invalid or not found/],
    [500, {}, /Couldn't verify this invitation right now/],
  ])('a %s answer shows the matching message', async (status, body, message) => {
    mock.onPost('/auth/invite/validate').reply(status, body);
    renderPage();

    expect(await screen.findByText('Invitation Invalid')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('shows the form with the invited email locked in', async () => {
    mock.onPost('/auth/invite/validate').reply(200, INVITE);
    renderPage();

    const email = await screen.findByLabelText(/^email/i);
    expect(email).toHaveValue('new.doc@example.com');
    expect(email).toBeDisabled();
  });
});

describe('registration form', () => {
  beforeEach(() => {
    mock.onPost('/auth/invite/validate').reply(200, INVITE);
  });

  async function fillRequired(user: ReturnType<typeof userEvent.setup>, overrides: Record<string, string> = {}) {
    const values = {
      username: 'new_doc',
      password: 'secret123',
      confirm: 'secret123',
      first: 'New',
      last: 'Doctor',
      ...overrides,
    };
    await user.type(await screen.findByLabelText(/^username/i), values.username);
    await user.type(screen.getByLabelText(/^password/i), values.password);
    await user.type(screen.getByLabelText(/^confirm password/i), values.confirm);
    await user.type(screen.getByLabelText(/^first name/i), values.first);
    await user.type(screen.getByLabelText(/^last name/i), values.last);
  }

  const submit = () => screen.getByRole('button', { name: /complete registration/i });

  it('does not send mismatched passwords', async () => {
    const user = userEvent.setup();
    renderPage();

    await fillRequired(user, { confirm: 'different1' });
    await user.click(submit());

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    // The token check is itself a POST, so count only the registration call.
    expect(mock.history.post.filter((r) => r.url === '/auth/register/invite')).toHaveLength(0);
  });

  it('registers, signs in and opens the dashboard', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/register/invite').reply(201, { id: 5 });
    mock.onPost('/auth/login').reply(200, { access_token: 'fresh' });
    mock.onGet('/auth/me').reply(200, { id: 5, username: 'new_doc', user_type: 'doctor' });
    renderPage();

    await fillRequired(user);
    await user.click(submit());

    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    const registration = mock.history.post.find((r) => r.url === '/auth/register/invite')!;
    const sent = JSON.parse(registration.data);
    expect(sent).toMatchObject({ username: 'new_doc', first_name: 'New', last_name: 'Doctor' });
    // A blank phone goes out as absent: the backend pattern rejects "".
    expect(sent).not.toHaveProperty('phone');
  });

  it('puts a 422 field error on its field', async () => {
    // The exact shape main.py's RequestValidationError handler returns: a joined
    // string in `detail` AND the per-field list in `errors`. Reading `detail` first
    // finds a string and never looks at `errors`.
    const user = userEvent.setup();
    mock.onPost('/auth/register/invite').reply(422, {
      detail: 'Username may only contain letters, numbers and underscores.',
      errors: [{ field: 'username', message: 'Username may only contain letters, numbers and underscores.' }],
    });
    renderPage();

    await fillRequired(user);
    await user.click(submit());

    await waitFor(() => expect(screen.getByLabelText(/^username/i)).toBeInvalid());
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();
  });

  it('shows a plain-string failure as the form error', async () => {
    const user = userEvent.setup();
    mock.onPost('/auth/register/invite').reply(400, { detail: 'Username already registered' });
    renderPage();

    await fillRequired(user);
    await user.click(submit());

    expect(await screen.findByText('Username already registered')).toBeInTheDocument();
  });
});
