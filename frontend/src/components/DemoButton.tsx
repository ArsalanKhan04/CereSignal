import React from 'react';
import { Button, ButtonProps } from '@mui/material';
import FlashIcon from '@mui/icons-material/FlashOn';

interface DemoButtonProps extends Omit<ButtonProps, 'variant' | 'color'> {
  label: string;
}

const DemoButton: React.FC<DemoButtonProps> = ({ label, sx, ...rest }) => {
  return (
    <Button
      variant="outlined"
      startIcon={<FlashIcon sx={{ fontSize: '14px !important' }} />}
      size="small"
      sx={{
        borderColor: '#f59e0b',
        color: '#92400e',
        bgcolor: '#fffbeb',
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'none',
        borderRadius: 2,
        '&:hover': {
          borderColor: '#d97706',
          bgcolor: '#fef3c7',
        },
        ...sx,
      }}
      {...rest}
    >
      {label}
    </Button>
  );
};

export default DemoButton;
