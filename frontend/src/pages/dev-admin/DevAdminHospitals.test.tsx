/**
 * The superuser's hospital list: it renders each tenant's summary, filters by
 * name or code, and links through to the detail page.
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import DevAdminHospitals from './DevAdminHospitals';
import apiClient from '../../services/api';

const hospital = (id: number, name: string, code: string, extra: object = {}) => ({
  id, name, code,
  address: null, phone: null, email: null, is_active: true, created_at: '2026-01-01T00:00:00Z',
  total_doctors: 2, total_technicians: 1, total_patients: 7, total_files: 3,
  pending_reports: 0, completed_reports: 0,
  ...extra,
});

let mock: MockAdapter;
let consoleError: jest.SpyInstance;

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mock.restore();
  consoleError.mockRestore();
});

function Detail() {
  return <div>DETAIL {useParams().id}</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/dev-admin/hospitals']}>
      <Routes>
        <Route path="/dev-admin/hospitals" element={<DevAdminHospitals />} />
        <Route path="/dev-admin/hospitals/:id" element={<Detail />} />
      </Routes>
    </MemoryRouter>,
  );

it('renders one card per hospital with its counts', async () => {
  mock.onGet('/dev-admin/hospitals').reply(200, [
    hospital(1, 'General', 'gen', { pending_reports: 4 }),
    hospital(2, 'St Mary', 'stm', { is_active: false }),
  ]);
  renderPage();

  expect(await screen.findByText('General')).toBeInTheDocument();
  expect(screen.getByText('St Mary')).toBeInTheDocument();
  expect(screen.getByText('2 total')).toBeInTheDocument();
  expect(screen.getByText('4 pending reports')).toBeInTheDocument();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
});

it('filters by name or code, case-insensitively', async () => {
  const user = userEvent.setup();
  mock.onGet('/dev-admin/hospitals').reply(200, [
    hospital(1, 'General', 'gen'),
    hospital(2, 'St Mary', 'stm'),
  ]);
  renderPage();
  await screen.findByText('General');

  const search = screen.getByPlaceholderText(/search by name or code/i);
  await user.type(search, 'STM');
  expect(screen.queryByText('General')).not.toBeInTheDocument();
  expect(screen.getByText('St Mary')).toBeInTheDocument();

  await user.clear(search);
  await user.type(search, 'nowhere');
  expect(screen.getByText('No hospitals match your search.')).toBeInTheDocument();
});

it('links a card to its detail page', async () => {
  const user = userEvent.setup();
  mock.onGet('/dev-admin/hospitals').reply(200, [hospital(42, 'General', 'gen')]);
  renderPage();

  await user.click(await screen.findByRole('button', { name: /view details/i }));

  expect(screen.getByText('DETAIL 42')).toBeInTheDocument();
});

it('shows the empty state when the request fails', async () => {
  mock.onGet('/dev-admin/hospitals').reply(500);
  renderPage();

  expect(await screen.findByText('No hospitals registered yet.')).toBeInTheDocument();
});
