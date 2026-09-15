import { focusPages, snapStart } from './focusPages';

// focus_points as stored for 0001377.edf: the fallback path emits overlapping 10s windows 2s apart.
const recorded = [
  { center_s: 9, abnormal_pct: 4.2 },
  { center_s: 11, abnormal_pct: 4.2 },
  { center_s: 21, abnormal_pct: 3.2 },
  { center_s: 23, abnormal_pct: 3.2 },
  { center_s: 25, abnormal_pct: 4.2 },
  { center_s: 27, abnormal_pct: 4.2 },
  { center_s: 29, abnormal_pct: 3.2 },
  { center_s: 69, abnormal_pct: 3.2 },
  { center_s: 71, abnormal_pct: 3.2 },
  { center_s: 73, abnormal_pct: 3.2 },
].map((p) => ({ ...p, window_start: p.center_s - 5, window_end: p.center_s + 5 }));

describe('snapStart', () => {
  it('rounds down to a page boundary', () => {
    expect(snapStart(27, 10, null)).toBe(20);
  });

  it('clamps to 0 before the start of the recording', () => {
    expect(snapStart(-5, 10, 95)).toBe(0);
  });

  it('clamps to the last full page at the end of the recording', () => {
    expect(snapStart(90, 10, 95)).toBe(80);
  });

  it('returns 0 for a recording shorter than the window', () => {
    expect(snapStart(3, 10, 5)).toBe(0);
  });
});

describe('focusPages', () => {
  it('returns nothing for no focus points', () => {
    expect(focusPages([], 10, null)).toEqual([]);
  });

  it('collapses points that open the same page, keeping the most abnormal', () => {
    const pages = focusPages(recorded, 10, 600);

    expect(pages.map((p) => p.start)).toEqual([0, 10, 20, 60]);
    expect(pages.map((p) => p.point.center_s)).toEqual([9, 21, 25, 69]);
  });

  it.each([
    [20, [0, 40, 60]],
    [40, [0, 40]],
  ])('gives unique pages at a %ss window', (plotDuration, starts) => {
    expect(focusPages(recorded, plotDuration, 600).map((p) => p.start)).toEqual(starts);
  });

  it('is independent of input order', () => {
    expect(focusPages([...recorded].reverse(), 10, 600)).toEqual(focusPages(recorded, 10, 600));
  });
});
