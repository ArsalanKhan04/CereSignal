import {
  ValidationError,
  collectErrors,
  extractApiErrors,
  validateAge,
  validateBloodType,
  validateConfirmPassword,
  validateDateOfBirth,
  validateEmail,
  validateGender,
  validateHospitalName,
  validateInteger,
  validateMaxLength,
  validateName,
  validatePassword,
  validatePatientAge,
  validatePhone,
  validateRequired,
  validateRequiredSelect,
  validateUsername,
  validateYearsExperience,
} from './validation';

/** Every validator returns null on success and a {field, message} on failure. */
const expectField = (error: ValidationError | null, field: string) => {
  expect(error).not.toBeNull();
  expect(error!.field).toBe(field);
  expect(error!.message).toMatch(/\S/);
};

describe('validateRequired', () => {
  it.each([undefined, null, '', '   ', '\t\n'])('rejects %p', (value) => {
    expectField(validateRequired(value, 'name', 'Full name'), 'name');
  });

  it('accepts a non-blank value', () => {
    expect(validateRequired('Ada', 'name', 'Full name')).toBeNull();
  });

  it('uses the label in the message', () => {
    expect(validateRequired('', 'name', 'Full name')!.message).toBe('Full name is required.');
  });
});

describe('validateEmail', () => {
  it.each(['a@b.co', 'first.last@sub.domain.org', 'user+tag@example.com'])(
    'accepts %s',
    (value) => {
      expect(validateEmail(value)).toBeNull();
    },
  );

  it.each(['plain', 'no@domain', '@example.com', 'spaces in@example.com', 'a@b@c.com'])(
    'rejects %s',
    (value) => {
      expectField(validateEmail(value), 'email');
    },
  );

  it('is required, unlike phone and age', () => {
    expect(validateEmail('')!.message).toBe('Email address is required.');
  });

  it('trims before validating', () => {
    expect(validateEmail('  a@b.co  ')).toBeNull();
  });

  it('honours a custom field name', () => {
    expectField(validateEmail('bad', 'contact_email'), 'contact_email');
  });
});

describe('validateUsername', () => {
  it('accepts the 3-character minimum', () => {
    expect(validateUsername('abc')).toBeNull();
  });

  it('rejects 2 characters', () => {
    expect(validateUsername('ab')!.message).toBe('Username must be at least 3 characters.');
  });

  it('accepts the 50-character maximum', () => {
    expect(validateUsername('a'.repeat(50))).toBeNull();
  });

  it('rejects 51 characters', () => {
    expect(validateUsername('a'.repeat(51))!.message).toBe(
      'Username must be at most 50 characters.',
    );
  });

  it('allows letters, digits and underscores', () => {
    expect(validateUsername('dr_house_99')).toBeNull();
  });

  it.each(['has space', 'has-dash', 'has.dot', 'héllo'])('rejects %s', (value) => {
    expectField(validateUsername(value), 'username');
  });

  it('rejects blank', () => {
    expect(validateUsername('   ')!.message).toBe('Username is required.');
  });
});

describe('validatePassword', () => {
  it('accepts the 6-character minimum', () => {
    expect(validatePassword('abcdef')).toBeNull();
  });

  it('rejects 5 characters', () => {
    expect(validatePassword('abcde')!.message).toBe('Password must be at least 6 characters.');
  });

  it('does not trim — leading spaces count toward the length', () => {
    expect(validatePassword('   abc')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validatePassword('')!.message).toBe('Password is required.');
  });
});

describe('validateConfirmPassword', () => {
  it('accepts a match', () => {
    expect(validateConfirmPassword('secret', 'secret')).toBeNull();
  });

  it('rejects a mismatch', () => {
    expect(validateConfirmPassword('secret', 'other')!.message).toBe('Passwords do not match.');
  });

  it('rejects an empty confirmation before comparing', () => {
    expect(validateConfirmPassword('', '')!.message).toBe('Please confirm your password.');
  });

  it('reports against the confirm_password field', () => {
    expectField(validateConfirmPassword('a', 'b'), 'confirm_password');
  });
});

describe('validateName', () => {
  it('accepts a normal name', () => {
    expect(validateName('Ada Lovelace', 'name', 'Full name')).toBeNull();
  });

  it('rejects blank', () => {
    expect(validateName('  ', 'name', 'Full name')!.message).toBe('Full name is required.');
  });

  it('defaults to a 100-character limit', () => {
    expect(validateName('a'.repeat(100), 'name', 'Full name')).toBeNull();
    expect(validateName('a'.repeat(101), 'name', 'Full name')!.message).toBe(
      'Full name must be at most 100 characters.',
    );
  });

  it('honours a custom limit', () => {
    expect(validateName('abcdef', 'name', 'Full name', 5)!.message).toBe(
      'Full name must be at most 5 characters.',
    );
  });

  it('measures the trimmed length', () => {
    expect(validateName(`  ${'a'.repeat(100)}  `, 'name', 'Full name')).toBeNull();
  });
});

describe('validatePhone', () => {
  it('is optional — blank is accepted', () => {
    expect(validatePhone('')).toBeNull();
    expect(validatePhone(undefined)).toBeNull();
    expect(validatePhone('   ')).toBeNull();
  });

  it.each(['+1 (555) 123-4567', '03001234567', '021-111-222', '+92 300 1234567'])(
    'accepts %s',
    (value) => {
      expect(validatePhone(value)).toBeNull();
    },
  );

  it.each(['123456', 'abcdefgh', '+1 (555) 123-4567 ext. 99'])('rejects %s', (value) => {
    expectField(validatePhone(value), 'phone');
  });

  it('honours a custom field name', () => {
    expectField(validatePhone('abc', 'emergency_contact_phone'), 'emergency_contact_phone');
  });
});

describe('validateAge', () => {
  it('is optional', () => {
    expect(validateAge('')).toBeNull();
    expect(validateAge(null)).toBeNull();
  });

  it.each(['0', '130', '45'])('accepts %s', (value) => {
    expect(validateAge(value)).toBeNull();
  });

  it.each(['-1', '131'])('rejects out-of-range %s', (value) => {
    expect(validateAge(value)!.message).toBe('Age must be between 0 and 130.');
  });

  it.each(['12.5', 'abc'])('rejects non-integer %s', (value) => {
    expect(validateAge(value)!.message).toBe('Age must be a whole number.');
  });
});

describe('validatePatientAge', () => {
  it('allows up to 150, unlike validateAge', () => {
    expect(validatePatientAge('150')).toBeNull();
    expect(validateAge('150')).not.toBeNull();
  });

  it('rejects 151', () => {
    expect(validatePatientAge('151')!.message).toBe('Age must be between 0 and 150.');
  });

  it('reports against the patient_age field', () => {
    expectField(validatePatientAge('999'), 'patient_age');
  });
});

describe('validateYearsExperience', () => {
  it('is optional', () => {
    expect(validateYearsExperience('')).toBeNull();
  });

  it.each(['0', '100'])('accepts the boundary %s', (value) => {
    expect(validateYearsExperience(value)).toBeNull();
  });

  it('rejects 101', () => {
    expect(validateYearsExperience('101')!.message).toBe(
      'Years of experience must be between 0 and 100.',
    );
  });
});

describe('validateDateOfBirth', () => {
  // The validator compares against new Date(), so the clock is frozen.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is optional', () => {
    expect(validateDateOfBirth('')).toBeNull();
    expect(validateDateOfBirth(undefined)).toBeNull();
  });

  it('accepts a past date', () => {
    expect(validateDateOfBirth('1990-04-01')).toBeNull();
  });

  it('rejects a future date', () => {
    expect(validateDateOfBirth('2030-01-01')!.message).toBe(
      'Date of birth cannot be in the future.',
    );
  });

  it('rejects an unparseable date', () => {
    expect(validateDateOfBirth('not-a-date')!.message).toBe('Please enter a valid date.');
  });

  it('accepts today', () => {
    expect(validateDateOfBirth('2026-09-10T00:00:00Z')).toBeNull();
  });
});

describe('validateGender', () => {
  it('is optional', () => {
    expect(validateGender('')).toBeNull();
  });

  it.each(['M', 'F', 'Other'])('accepts %s', (value) => {
    expect(validateGender(value)).toBeNull();
  });

  it.each(['male', 'm', 'X'])('rejects %s', (value) => {
    expectField(validateGender(value), 'gender');
  });

  it('honours a custom field name', () => {
    expectField(validateGender('nope', 'patient_gender'), 'patient_gender');
  });
});

describe('validateBloodType', () => {
  it('is optional', () => {
    expect(validateBloodType('')).toBeNull();
  });

  it.each(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])('accepts %s', (value) => {
    expect(validateBloodType(value)).toBeNull();
  });

  it.each(['C+', 'a+', 'O'])('rejects %s', (value) => {
    expectField(validateBloodType(value), 'blood_type');
  });
});

describe('validateHospitalName', () => {
  it('requires at least 2 characters', () => {
    expect(validateHospitalName('A')!.message).toBe(
      'Hospital name must be at least 2 characters.',
    );
    expect(validateHospitalName('AB')).toBeNull();
  });

  it('caps at 255 characters', () => {
    expect(validateHospitalName('a'.repeat(255))).toBeNull();
    expect(validateHospitalName('a'.repeat(256))!.message).toBe(
      'Hospital name must be at most 255 characters.',
    );
  });

  it('rejects blank', () => {
    expect(validateHospitalName('   ')!.message).toBe('Hospital name is required.');
  });
});

describe('validateRequiredSelect', () => {
  it('lowercases the label in the prompt', () => {
    expect(validateRequiredSelect('', 'gender', 'Gender')!.message).toBe(
      'Please select gender.',
    );
  });

  it('accepts a chosen value', () => {
    expect(validateRequiredSelect('M', 'gender', 'Gender')).toBeNull();
  });
});

describe('validateMaxLength', () => {
  it('ignores blank values', () => {
    expect(validateMaxLength('', 'notes', 'Notes', 5)).toBeNull();
    expect(validateMaxLength(undefined, 'notes', 'Notes', 5)).toBeNull();
  });

  it('accepts exactly the limit', () => {
    expect(validateMaxLength('abcde', 'notes', 'Notes', 5)).toBeNull();
  });

  it('rejects one over the limit', () => {
    expect(validateMaxLength('abcdef', 'notes', 'Notes', 5)!.message).toBe(
      'Notes must be at most 5 characters.',
    );
  });
});

describe('validateInteger', () => {
  it('is optional', () => {
    expect(validateInteger('', 'count', 'Count', 0, 10)).toBeNull();
  });

  it.each(['0', '10', '5'])('accepts in-range %s', (value) => {
    expect(validateInteger(value, 'count', 'Count', 0, 10)).toBeNull();
  });

  it('rejects out of range with both bounds named', () => {
    expect(validateInteger('11', 'count', 'Count', 0, 10)!.message).toBe(
      'Count must be between 0 and 10.',
    );
  });

  it('rejects a decimal', () => {
    expect(validateInteger('1.5', 'count', 'Count', 0, 10)!.message).toBe(
      'Count must be a whole number.',
    );
  });
});

describe('collectErrors', () => {
  it('drops the nulls', () => {
    const errors = collectErrors(
      validateRequired('Ada', 'name', 'Full name'),
      validateEmail('bad'),
      validatePassword('abc'),
    );

    expect(errors.map((e) => e.field)).toEqual(['email', 'password']);
  });

  it('returns an empty array when everything passes', () => {
    expect(collectErrors(null, null)).toEqual([]);
  });

  it('accepts no arguments', () => {
    expect(collectErrors()).toEqual([]);
  });
});

describe('extractApiErrors', () => {
  // This is how FastAPI's error shapes reach the UI. main.py's validation handler
  // returns {detail, errors: [{field, message}]}; other handlers return a string.

  it('falls back when detail is missing', () => {
    expect(extractApiErrors(undefined)).toEqual({
      general: 'An unexpected error occurred.',
      fields: [],
    });
  });

  it('uses the supplied fallback', () => {
    expect(extractApiErrors(null, 'Could not sign in.').general).toBe('Could not sign in.');
  });

  it('treats a string detail as a general message', () => {
    expect(extractApiErrors('Incorrect username or password')).toEqual({
      general: 'Incorrect username or password',
      fields: [],
    });
  });

  it('maps an array of field errors', () => {
    const result = extractApiErrors([
      { field: 'username', message: 'Username is required.' },
      { field: 'password', message: 'Password is required.' },
    ]);

    expect(result.fields).toHaveLength(2);
    expect(result.fields[0]).toEqual({ field: 'username', message: 'Username is required.' });
  });

  it('promotes a lone field error to the general message too', () => {
    const result = extractApiErrors([{ field: 'email', message: 'Please enter a valid email.' }]);

    expect(result.general).toBe('Please enter a valid email.');
  });

  it('leaves general unset when several fields failed', () => {
    const result = extractApiErrors([
      { field: 'a', message: 'A bad.' },
      { field: 'b', message: 'B bad.' },
    ]);

    expect(result.general).toBeUndefined();
  });

  it('accepts pydantic-style msg keys', () => {
    const result = extractApiErrors([{ loc: ['body', 'email'], msg: 'value is not valid' }]);

    expect(result.fields[0]).toEqual({ field: 'unknown', message: 'value is not valid' });
  });

  it('stringifies an unrecognised object detail', () => {
    const result = extractApiErrors({ unexpected: true });

    expect(result.fields).toEqual([]);
    expect(typeof result.general).toBe('string');
  });
});
