/**
 * ReportForm: the one screen where a doctor's clinical text is written and saved.
 *
 * Covered here: the create/update split (POST for a new report, PUT for an
 * existing one), the client-side guard on the one required clinical field, and how
 * the form reads /report-status. A `failed` report must say so rather than open
 * silently, and a no-AI deployment must not poll for a report that is never queued.
 */

import React from 'react';
import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportForm from './ReportForm';
import { AuthProvider } from '../contexts/AuthContext';
import { ConfigProvider, useConfig } from '../contexts/ConfigContext';
import apiClient from '../services/api';

const EXISTING = {
  id: 77,
  file_id: 5,
  report_date: '2026-09-01T00:00:00Z',
  patient_name: 'Jane Doe',
  patient_age: 40,
  patient_gender: 'F',
  ref_physician: 'Dr Ref',
  indications: 'Seizure work-up',
  technique: '10-20',
  factual_report: 'Background 9 Hz.',
  impression: 'Normal',
  doctor_info: 'Dr A | Neurologist | Neurology',
  is_finalized: false,
};

let mock: MockAdapter;
let quiet: jest.SpyInstance[];

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
  mock.onGet('/config').reply(200, { ai_inference_enabled: true });
  quiet = [
    jest.spyOn(console, 'log').mockImplementation(() => {}),
    jest.spyOn(console, 'error').mockImplementation(() => {}),
  ];
});

afterEach(() => {
  mock.restore();
  quiet.forEach((spy) => spy.mockRestore());
});

/**
 * In the app ConfigProvider sits at the root and has long settled before a report
 * form opens; ReportForm reads the flag once, on mount. Mount it the same way here.
 */
function AfterConfig({ children }: { children: React.ReactNode }) {
  return useConfig().isLoading ? null : <>{children}</>;
}

const renderForm = (props: React.ComponentProps<typeof ReportForm>) =>
  render(
    <ConfigProvider>
      <AuthProvider>
        <AfterConfig>
          <ReportForm {...props} />
        </AfterConfig>
      </AuthProvider>
    </ConfigProvider>,
  );

const factualReport = () => screen.getByRole('textbox', { name: /factual report/i });

describe('editing an existing report', () => {
  it('loads the stored fields and splits the doctor info', async () => {
    renderForm({ existingReport: EXISTING as any });

    expect(await screen.findByDisplayValue('Jane Doe')).toBeInTheDocument();
    expect(factualReport()).toHaveValue('Background 9 Hz.');
    expect(screen.getByLabelText(/doctor name/i)).toHaveValue('Dr A');
    expect(screen.getByLabelText(/department/i)).toHaveValue('Neurology');
    expect(screen.getByRole('button', { name: /update report/i })).toBeInTheDocument();
  });

  it('saves with a PUT to that report', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    mock.onPut('/reports/77').reply(200, { ...EXISTING, impression: 'Abnormal' });
    renderForm({ existingReport: EXISTING as any, onSave });

    const impression = await screen.findByRole('textbox', { name: /impression/i });
    await user.clear(impression);
    await user.type(impression, 'Abnormal');
    await user.click(screen.getByRole('button', { name: /update report/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const body = JSON.parse(mock.history.put[0].data);
    expect(body).toMatchObject({
      impression: 'Abnormal',
      factual_report: 'Background 9 Hz.',
      doctor_info: 'Dr A | Neurologist | Neurology',
    });
    expect(mock.history.post.filter((r) => r.url === '/reports/')).toHaveLength(0);
    expect(await screen.findByText('Report saved successfully!')).toBeInTheDocument();
  });

  it('will not send a report with no factual text', async () => {
    const user = userEvent.setup();
    renderForm({ existingReport: EXISTING as any });

    await user.clear(await screen.findByRole('textbox', { name: /factual report/i }));
    await user.click(screen.getByRole('button', { name: /update report/i }));

    expect(await screen.findByText('Factual report is required.')).toBeInTheDocument();
    expect(mock.history.put).toHaveLength(0);
  });

  it('shows the server message when the save is refused', async () => {
    const user = userEvent.setup();
    mock.onPut('/reports/77').reply(403, { detail: 'Report is finalized' });
    renderForm({ existingReport: EXISTING as any });

    await user.click(await screen.findByRole('button', { name: /update report/i }));

    expect(await screen.findByText('Report is finalized')).toBeInTheDocument();
  });
});

describe('a new report for a file', () => {
  beforeEach(() => {
    mock.onGet('/reports/file/5').reply(404);
  });

  it('creates it with a POST', async () => {
    const user = userEvent.setup();
    mock.onGet('/signals/files/5/report-status').reply(200, { report_status: 'not_started' });
    mock.onPost('/reports/').reply(201, { ...EXISTING, id: 90 });
    renderForm({ fileId: 5, patient: { id: 1, name: 'New Patient', age: 30, gender: 'M' } as any });

    expect(await screen.findByDisplayValue('New Patient')).toBeInTheDocument();
    await user.type(factualReport(), 'Written by hand.');
    await user.click(screen.getByRole('button', { name: /save report/i }));

    await waitFor(() => expect(mock.history.post.some((r) => r.url === '/reports/')).toBe(true));
    const body = JSON.parse(mock.history.post.find((r) => r.url === '/reports/')!.data);
    expect(body).toMatchObject({ file_id: 5, patient_name: 'New Patient', factual_report: 'Written by hand.' });
    expect(await screen.findByRole('button', { name: /update report/i })).toBeInTheDocument();
  });

  it('fills in a completed AI report', async () => {
    mock.onGet('/signals/files/5/report-status').reply(200, {
      report_status: 'completed',
      has_report: true,
      report: { factual_report: 'AI factual text', impression: 'AI impression' },
    });
    renderForm({ fileId: 5 });

    await waitFor(() => expect(factualReport()).toHaveValue('AI factual text'));
    expect(screen.getByText('AI-generated report loaded successfully!')).toBeInTheDocument();
  });

  it('says so when AI generation failed, and leaves the form usable', async () => {
    mock.onGet('/signals/files/5/report-status').reply(200, { report_status: 'failed' });
    renderForm({ fileId: 5 });

    expect(await screen.findByText(/AI report generation failed/)).toBeInTheDocument();
    expect(factualReport()).toBeEnabled();
  });

  it('never asks for report status in a no-AI deployment', async () => {
    mock.onGet('/config').reply(200, { ai_inference_enabled: false });
    renderForm({ fileId: 5 });

    await waitFor(() => expect(mock.history.get.some((r) => r.url === '/reports/file/5')).toBe(true));
    await screen.findByRole('button', { name: /save report/i });
    expect(mock.history.get.some((r) => r.url?.endsWith('/report-status'))).toBe(false);
  });
});
