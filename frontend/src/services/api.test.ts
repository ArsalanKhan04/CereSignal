/**
 * Tests for the axios interceptors in src/services/api.ts.
 *
 * This is the most security-relevant untested code on the frontend. The request
 * interceptor attaches the bearer token from localStorage; the response
 * interceptor clears the stored credentials and redirects on a 401 — except on
 * the login endpoint, where a redirect would bounce the user off the form that
 * is about to show them "wrong password".
 *
 * The mock adapter is attached to the real axios instance (apiClient.client), so
 * every request below runs through both interceptors. Mocking the api module
 * instead would test none of this.
 */

import MockAdapter from 'axios-mock-adapter';
import apiClient from './api';

let mock: MockAdapter;

/** What setupTests.ts resets window.location.href to before each test. */
const UNTOUCHED = 'http://localhost/';

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
});

afterEach(() => {
  mock.restore();
});

describe('request interceptor', () => {
  it('attaches the bearer token when one is stored', async () => {
    window.localStorage.setItem('auth_token', 'stored-token');
    mock.onGet('/auth/me').reply(200, {});

    await apiClient.getCurrentUser();

    expect(mock.history.get[0].headers?.Authorization).toBe('Bearer stored-token');
  });

  it('sends no Authorization header when nothing is stored', async () => {
    mock.onGet('/auth/me').reply(200, {});

    await apiClient.getCurrentUser();

    expect(mock.history.get[0].headers?.Authorization).toBeUndefined();
  });

  it('stamps every request with a distinct X-Request-ID', async () => {
    mock.onGet('/auth/me').reply(200, {});

    await apiClient.getCurrentUser();
    await apiClient.getCurrentUser();

    const [first, second] = mock.history.get.map((r) => r.headers?.['X-Request-ID']);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('picks up a token stored after the client was constructed', async () => {
    // The singleton is created at import time; the token arrives at login.
    mock.onGet('/auth/me').reply(200, {});
    window.localStorage.setItem('auth_token', 'late-token');

    await apiClient.getCurrentUser();

    expect(mock.history.get[0].headers?.Authorization).toBe('Bearer late-token');
  });
});

describe('response interceptor on 401', () => {
  it('clears the stored credentials', async () => {
    window.localStorage.setItem('auth_token', 'stale');
    window.localStorage.setItem('current_user', '{"id":1}');
    mock.onGet('/auth/me').reply(401);

    await expect(apiClient.getCurrentUser()).rejects.toBeTruthy();

    expect(window.localStorage.getItem('auth_token')).toBeNull();
    expect(window.localStorage.getItem('current_user')).toBeNull();
  });

  it('redirects to the root for a non-login endpoint', async () => {
    mock.onGet('/auth/me').reply(401);

    await expect(apiClient.getCurrentUser()).rejects.toBeTruthy();

    expect(window.location.href).toBe('/');
  });

  it('does NOT redirect when the login request itself is rejected', async () => {
    // A redirect here would throw the user off the form before it can render the
    // "invalid credentials" error.
    window.location.href = '/login';
    mock.onPost('/auth/login').reply(401, { detail: 'Incorrect username or password' });

    await expect(apiClient.login({ username: 'x', password: 'y' } as any)).rejects.toBeTruthy();

    expect(window.location.href).toBe('/login');
  });

  it('still clears credentials on a failed login', async () => {
    window.localStorage.setItem('auth_token', 'stale');
    mock.onPost('/auth/login').reply(401);

    await expect(apiClient.login({ username: 'x', password: 'y' } as any)).rejects.toBeTruthy();

    expect(window.localStorage.getItem('auth_token')).toBeNull();
  });

  it('rejects rather than resolving, so callers see the failure', async () => {
    mock.onGet('/auth/me').reply(401);

    await expect(apiClient.getCurrentUser()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
});

describe('other error statuses', () => {
  it.each([403, 404, 422, 500])('leaves the session alone on %i', async (status) => {
    window.localStorage.setItem('auth_token', 'keep-me');
    mock.onGet('/auth/me').reply(status);

    await expect(apiClient.getCurrentUser()).rejects.toBeTruthy();

    expect(window.localStorage.getItem('auth_token')).toBe('keep-me');
    expect(window.location.href).toBe(UNTOUCHED);
  });
});

describe('successful responses', () => {
  it('unwraps data and status', async () => {
    mock.onGet('/auth/me').reply(200, { id: 7, username: 'doctor_a' });

    const res = await apiClient.getCurrentUser();

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: 7, username: 'doctor_a' });
  });
});
