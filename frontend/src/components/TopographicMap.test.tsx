/**
 * Tests for TopographicMap.
 *
 * The component exists because the topomap endpoint requires an Authorization
 * header, so an `<img src>` cannot fetch it — the PNG is pulled as a blob and
 * rendered from an object URL instead. These tests pin that indirection,
 * including the revoke on unmount, which is the part that leaks if it regresses.
 */

import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import TopographicMap from './TopographicMap';
import apiClient from '../services/api';

let mock: MockAdapter;
const createObjectURL = jest.fn();
const revokeObjectURL = jest.fn();

beforeEach(() => {
  mock = new MockAdapter(apiClient.client);
  // react-scripts sets jest's `resetMocks: true`, which strips the implementation
  // off any jest.fn() between tests. Declaring it here rather than at the jest.fn()
  // call is what keeps createObjectURL from quietly returning undefined.
  createObjectURL.mockImplementation(() => 'blob:fake-url');
  // jsdom implements neither. Note the axios instance is mapped to the node build
  // (see jest.moduleNameMapper), so `responseType: 'blob'` yields a string here —
  // what matters is that whatever comes back is handed to createObjectURL.
  (URL as any).createObjectURL = createObjectURL;
  (URL as any).revokeObjectURL = revokeObjectURL;
});

afterEach(() => mock.restore());

describe('TopographicMap', () => {
  it('renders the heading immediately', async () => {
    mock.onGet(/topomap/).reply(200, '');

    render(<TopographicMap fileId={1} />);

    expect(screen.getByText('Topographic Map')).toBeInTheDocument();
    // Let the in-flight fetch settle, or its state update lands after the test
    // and React reports it as an update outside act().
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it('renders the image once the blob arrives', async () => {
    mock.onGet(/topomap/).reply(200, 'png-bytes');

    render(<TopographicMap fileId={1} />);

    await screen.findByAltText('Topographic Map');
    expect(screen.getByAltText('Topographic Map')).toHaveAttribute('src', 'blob:fake-url');
  });

  it('says so when the recording has no map', async () => {
    mock.onGet(/topomap/).reply(404);

    render(<TopographicMap fileId={1} />);

    await screen.findByText('No topographic map available for this recording.');
  });

  it('shows no broken image while loading', async () => {
    mock.onGet(/topomap/).reply(200, '');

    render(<TopographicMap fileId={1} />);

    expect(screen.queryByAltText('Topographic Map')).not.toBeInTheDocument();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it('revokes the object URL on unmount', async () => {
    mock.onGet(/topomap/).reply(200, 'png-bytes');

    const { unmount } = render(<TopographicMap fileId={1} />);
    await screen.findByAltText('Topographic Map');
    unmount();

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url'));
  });

  it('refetches when the file changes', async () => {
    mock.onGet(/topomap/).reply(200, 'png-bytes');

    const { rerender } = render(<TopographicMap fileId={1} />);
    await screen.findByAltText('Topographic Map');
    rerender(<TopographicMap fileId={2} />);

    await waitFor(() => expect(mock.history.get.length).toBe(2));
  });
});
