import React from 'react';
import Box from '@mui/material/Box';
import Typography, { TypographyProps } from '@mui/material/Typography';

/**
 * Explains the asterisk that MUI renders on `required` fields. Every form that
 * marks any field required should show this once, so the asterisk is a signal
 * the user can actually read rather than decoration.
 */
const RequiredFieldsNote: React.FC<TypographyProps> = (props) => (
  <Typography variant="caption" color="text.secondary" display="block" {...props}>
    Fields marked <Box component="span" sx={{ color: 'error.main' }}>*</Box> are required.
  </Typography>
);

export default RequiredFieldsNote;
