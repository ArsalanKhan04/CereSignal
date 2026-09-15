import React from 'react';
import TextField, { TextFieldProps } from '@mui/material/TextField';

interface FormTextFieldProps extends Omit<TextFieldProps, 'error'> {
  fieldError?: string | null;
}

const FormTextField: React.FC<FormTextFieldProps> = ({ fieldError, helperText, ...props }) => {
  return (
    <TextField
      fullWidth
      size="medium"
      {...props}
      error={!!fieldError}
      helperText={fieldError || helperText || undefined}
    />
  );
};

export default FormTextField;
