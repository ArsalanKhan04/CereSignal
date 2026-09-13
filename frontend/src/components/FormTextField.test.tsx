/**
 * Tests for the shared form primitives.
 *
 * These three components are tiny, but every form in the app renders them, so a
 * regression here is a regression everywhere. FormTextField in particular owns
 * the rule that a field error both flips the error state *and* replaces the
 * helper text — the visible half of the validation the utils/validation.ts suite
 * already covers in the abstract.
 */

import { render, screen } from '@testing-library/react';
import FormAlert from './FormAlert';
import FormTextField from './FormTextField';
import RequiredFieldsNote from './RequiredFieldsNote';

describe('FormTextField', () => {
  it('shows the field error as helper text', () => {
    render(<FormTextField label="Email" fieldError="Enter a valid email address" />);

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('marks the input invalid when there is an error', () => {
    render(<FormTextField label="Email" fieldError="bad" />);

    expect(screen.getByLabelText(/email/i)).toBeInvalid();
  });

  it('falls back to helperText when there is no error', () => {
    render(<FormTextField label="Email" helperText="We never share this" />);

    expect(screen.getByText('We never share this')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeValid();
  });

  it('prefers the error over the helper text', () => {
    render(<FormTextField label="Email" fieldError="Required" helperText="We never share this" />);

    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.queryByText('We never share this')).not.toBeInTheDocument();
  });

  it('treats an empty-string error as no error', () => {
    // collectErrors yields '' for "no message", which must not light the field red.
    render(<FormTextField label="Email" fieldError="" helperText="hint" />);

    expect(screen.getByLabelText(/email/i)).toBeValid();
  });

  it('passes the required flag through to the input', () => {
    render(<FormTextField label="Email" required />);

    expect(screen.getByLabelText(/email/i)).toBeRequired();
  });

  it('forwards the value', () => {
    render(<FormTextField label="Email" value="ada@example.test" onChange={() => {}} />);

    expect(screen.getByLabelText(/email/i)).toHaveValue('ada@example.test');
  });
});

describe('FormAlert', () => {
  it('renders an error alert', () => {
    render(<FormAlert error="Could not save the report" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the report');
  });

  it('renders a success alert', () => {
    render(<FormAlert success="Report saved" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Report saved');
  });

  it('renders nothing when neither is set', () => {
    render(<FormAlert />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('can show both at once', () => {
    render(<FormAlert error="one failed" success="the rest saved" />);

    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('auto-dismisses a success message after the given delay', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(<FormAlert success="Saved" onDismiss={onDismiss} autoHideMs={3000} />);

    expect(onDismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('never auto-dismisses an error', () => {
    // An error the user did not read is an error they will hit again.
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(<FormAlert error="Could not save" onDismiss={onDismiss} autoHideMs={3000} />);

    jest.advanceTimersByTime(10000);

    expect(onDismiss).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('RequiredFieldsNote', () => {
  it('explains the asterisk', () => {
    render(<RequiredFieldsNote />);

    expect(screen.getByText(/are required/i)).toBeInTheDocument();
  });
});
