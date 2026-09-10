import { pdfNameFromEdf } from './fileNames';

describe('pdfNameFromEdf', () => {
  it('swaps the extension for .pdf', () => {
    expect(pdfNameFromEdf('recording.edf')).toBe('recording.pdf');
  });

  it('strips a posix directory', () => {
    expect(pdfNameFromEdf('signals/nested/recording.edf')).toBe('recording.pdf');
  });

  it('strips a windows directory', () => {
    expect(pdfNameFromEdf('C:\\uploads\\recording.edf')).toBe('recording.pdf');
  });

  it('handles a name with no extension', () => {
    expect(pdfNameFromEdf('recording')).toBe('recording.pdf');
  });

  it('keeps only the final extension', () => {
    expect(pdfNameFromEdf('0001377_3cc_processed.edf')).toBe('0001377_3cc_processed.pdf');
  });

  it('falls back to EEG_Report when given nothing', () => {
    expect(pdfNameFromEdf()).toBe('EEG_Report.pdf');
  });

  it('falls back when the name is blank', () => {
    expect(pdfNameFromEdf('   ')).toBe('EEG_Report.pdf');
  });

  it('uses the supplied fallback when there is no edf name', () => {
    expect(pdfNameFromEdf(undefined, 'Patient Smith')).toBe('Patient Smith.pdf');
  });

  it('prefers the edf name over the fallback', () => {
    expect(pdfNameFromEdf('recording.edf', 'Patient Smith')).toBe('recording.pdf');
  });

  it('trims surrounding whitespace', () => {
    expect(pdfNameFromEdf('  recording.edf  ')).toBe('recording.pdf');
  });

  it('falls back when the name is only an extension', () => {
    expect(pdfNameFromEdf('.edf')).toBe('EEG_Report.pdf');
  });
});
