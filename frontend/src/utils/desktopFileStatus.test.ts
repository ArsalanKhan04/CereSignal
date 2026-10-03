import { desktopFileStatus } from './desktopFileStatus';

describe('desktopFileStatus', () => {
  it('shows analysis in progress instead of "No Report"', () => {
    expect(desktopFileStatus('processing', 'processing', null)).toEqual({
      label: 'Analyzing…',
      color: 'info',
      busy: true,
    });
  });

  it('treats a processing row as analysing even before the first status poll', () => {
    expect(desktopFileStatus(undefined, 'processing', null).busy).toBe(true);
  });

  it('shows the model outcome once analysis finishes', () => {
    expect(desktopFileStatus('normal', 'completed', null)).toMatchObject({ label: 'Normal', color: 'success' });
    expect(desktopFileStatus('ABNORMAL', 'completed', null)).toMatchObject({ label: 'Abnormal', color: 'error' });
  });

  it("falls back to the doctor's impression when the model gave no label", () => {
    expect(desktopFileStatus('pending_review', 'completed', { impression: 'Abnormal' }).label).toBe('Abnormal');
  });

  it('says so when analysis failed', () => {
    expect(desktopFileStatus('failed', 'failed', null)).toMatchObject({ label: 'Analysis failed', busy: false });
  });

  it('keeps the existing labels for finished recordings without an outcome', () => {
    expect(desktopFileStatus('pending_review', 'completed', null).label).toBe('No Report');
    expect(desktopFileStatus('pending_review', 'completed', { impression: 'See notes' }).label).toBe('Unassigned');
  });
});
