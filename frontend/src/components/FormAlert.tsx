import React, { useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';

interface FormAlertProps {
  error?: string | null;
  success?: string | null;
  onDismiss?: () => void;
  autoHideMs?: number;
}

const FormAlert: React.FC<FormAlertProps> = ({ error, success, onDismiss, autoHideMs }) => {
  useEffect(() => {
    if (success && onDismiss && autoHideMs) {
      const timer = setTimeout(onDismiss, autoHideMs);
      return () => clearTimeout(timer);
    }
  }, [success, onDismiss, autoHideMs]);

  return (
    <Box>
      {error && (
        <Alert
          severity="error"
          onClose={onDismiss ? () => onDismiss() : undefined}
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}
      {success && (
        <Alert
          severity="success"
          onClose={onDismiss ? () => onDismiss() : undefined}
          sx={{ mb: 2 }}
        >
          {success}
        </Alert>
      )}
    </Box>
  );
};

export default FormAlert;
