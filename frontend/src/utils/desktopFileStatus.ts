/**
 * The status chip a desktop doctor sees on a patient's recording.
 *
 * Desktop doctors label and report their own recordings, so the chip leads with the
 * outcome (Normal / Abnormal, from the model or the doctor's impression). While AI analysis
 * is still running there is no outcome yet, and without a state of its own the chip read
 * "No Report", exactly like a recording nobody had analysed.
 */
export interface DesktopFileStatus {
  label: string;
  color: 'success' | 'error' | 'info' | 'warning' | 'default';
  busy: boolean;
}

export function desktopFileStatus(
  condition: string | undefined,
  processingStatus: string | undefined,
  report: { impression?: string } | null | undefined
): DesktopFileStatus {
  const assignedCondition = condition?.toLowerCase();
  const assignedImpression = report?.impression?.toLowerCase();
  const effectiveLabel = assignedCondition === 'normal' || assignedCondition === 'abnormal'
    ? assignedCondition
    : assignedImpression === 'normal' || assignedImpression === 'abnormal'
      ? assignedImpression
      : undefined;

  if (effectiveLabel === 'normal') return { label: 'Normal', color: 'success', busy: false };
  if (effectiveLabel === 'abnormal') return { label: 'Abnormal', color: 'error', busy: false };
  if (assignedCondition === 'processing' || processingStatus === 'processing') {
    return { label: 'Analyzing…', color: 'info', busy: true };
  }
  if (assignedCondition === 'failed') return { label: 'Analysis failed', color: 'warning', busy: false };
  return report
    ? { label: 'Unassigned', color: 'default', busy: false }
    : { label: 'No Report', color: 'default', busy: false };
}
