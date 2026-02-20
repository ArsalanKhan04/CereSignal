export const pdfNameFromEdf = (edfName?: string, fallback?: string): string => {
  const source = edfName?.trim() || fallback?.trim() || 'EEG_Report';
  const base = source.split(/[\\/]/).pop() || source;
  const stem = base.replace(/\.[^/.]+$/, '');
  return `${stem || 'EEG_Report'}.pdf`;
};
