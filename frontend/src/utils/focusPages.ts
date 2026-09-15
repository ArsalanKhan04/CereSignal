import { FocusPoint } from '../types';

/** The last page start that still shows a full window, or Infinity while the duration is unknown. */
export function maxPageStart(plotDuration: number, totalDuration: number | null): number {
  const rawMaxStart = Math.max(0, (totalDuration ?? Infinity) - plotDuration);
  return Number.isFinite(rawMaxStart)
    ? Math.floor(rawMaxStart / plotDuration) * plotDuration
    : rawMaxStart;
}

/** The start of the page the viewer actually shows when asked to start at `nextStart`. */
export function snapStart(nextStart: number, plotDuration: number, totalDuration: number | null): number {
  const clampedStart = Math.max(0, Math.min(nextStart, maxPageStart(plotDuration, totalDuration)));
  return Math.floor(clampedStart / plotDuration) * plotDuration;
}

export interface FocusPage {
  start: number;
  point: FocusPoint;
}

/**
 * One entry per page the viewer would land on. Inference emits focus points 2s apart, and
 * centring each one snaps several of them onto the same page, so keep only the most abnormal
 * point per page (the earliest on a tie).
 */
export function focusPages(
  focusPoints: FocusPoint[],
  plotDuration: number,
  totalDuration: number | null
): FocusPage[] {
  const byStart = new Map<number, FocusPoint>();
  [...focusPoints]
    .sort((a, b) => a.center_s - b.center_s)
    .forEach((point) => {
      const start = snapStart(point.center_s - plotDuration / 2, plotDuration, totalDuration);
      const kept = byStart.get(start);
      if (!kept || point.abnormal_pct > kept.abnormal_pct) byStart.set(start, point);
    });
  return Array.from(byStart, ([start, point]) => ({ start, point })).sort((a, b) => a.start - b.start);
}
