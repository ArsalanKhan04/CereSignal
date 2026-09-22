/**
 * ConfigContext reads GET /config once at startup, and that is how one build serves
 * both AI and manual-entry-only deployments. The flag only ever switches features
 * off, so every failure mode has to leave AI enabled.
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider, useConfig } from './ConfigContext';
import apiClient from '../services/api';

let mock: MockAdapter;
let warn: jest.SpyInstance;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  mock.restore();
  warn.mockRestore();
});

function Probe() {
  const { aiInferenceEnabled, isLoading } = useConfig();
  return (
    <>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="ai">{String(aiInferenceEnabled)}</span>
    </>
  );
}

const renderProbe = () =>
  render(
    <ConfigProvider>
      <Probe />
    </ConfigProvider>,
  );

const settled = () => waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

it('assumes AI enabled while the request is in flight', () => {
  mock.onGet('/config').reply(() => new Promise(() => {}));
  renderProbe();

  expect(screen.getByTestId('loading')).toHaveTextContent('true');
  expect(screen.getByTestId('ai')).toHaveTextContent('true');
});

it('turns AI off when the backend says so', async () => {
  mock.onGet('/config').reply(200, { ai_inference_enabled: false });
  renderProbe();

  await settled();
  expect(screen.getByTestId('ai')).toHaveTextContent('false');
});

it('keeps AI on when the backend says so', async () => {
  mock.onGet('/config').reply(200, { ai_inference_enabled: true });
  renderProbe();

  await settled();
  expect(screen.getByTestId('ai')).toHaveTextContent('true');
});

it('keeps AI on when the request fails (an older backend without /config)', async () => {
  mock.onGet('/config').reply(404);
  renderProbe();

  await settled();
  expect(screen.getByTestId('ai')).toHaveTextContent('true');
  expect(warn).toHaveBeenCalled();
});

it('ignores a malformed flag rather than coercing it', async () => {
  mock.onGet('/config').reply(200, { ai_inference_enabled: 'false' });
  renderProbe();

  await settled();
  expect(screen.getByTestId('ai')).toHaveTextContent('true');
});
