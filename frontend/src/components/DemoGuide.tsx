import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  LinearProgress,
  Chip,
  Collapse,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  SkipNext as SkipIcon,
  ArrowForward as NextIcon,
  PlayCircle as PlayIcon,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material';
import { useDemo, DEMO_STEPS } from '../contexts/DemoContext';

const DemoGuide: React.FC = () => {
  const { isActive, currentStep, currentStepId, advanceStep, endDemo } = useDemo();
  const [collapsed, setCollapsed] = useState(false);

  if (!isActive || !currentStep) return null;

  const stepIndex = DEMO_STEPS.findIndex((s) => s.id === currentStepId);
  const totalSteps = DEMO_STEPS.length;
  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const isLastStep = stepIndex === totalSteps - 1;

  const phaseLabels: Record<number, string> = {
    0: 'Start',
    1: 'Admin',
    2: 'Technician',
    3: 'Login',
    4: 'Doctor',
    5: 'Report',
    6: 'Patient Portal',
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: collapsed ? 'auto' : 380,
        maxWidth: 'calc(100vw - 48px)',
        filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid rgba(245,158,11,0.3)',
          bgcolor: '#fffbeb',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
          }}
          onClick={() => setCollapsed((c) => !c)}
        >
          <PlayIcon sx={{ color: 'white', fontSize: 18 }} />
          <Typography variant="caption" fontWeight={700} color="white" sx={{ flex: 1 }}>
            GUIDED DEMO — Step {stepIndex + 1} of {totalSteps}
          </Typography>
          <Chip
            label={phaseLabels[currentStep.phase] ?? `Phase ${currentStep.phase}`}
            size="small"
            sx={{
              bgcolor: 'rgba(255,255,255,0.25)',
              color: 'white',
              fontWeight: 700,
              fontSize: 10,
              height: 20,
            }}
          />
          <IconButton size="small" sx={{ color: 'white', p: 0.25 }}>
            {collapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
          </IconButton>
          <Tooltip title="Exit Demo">
            <IconButton
              size="small"
              sx={{ color: 'white', p: 0.25 }}
              onClick={(e) => {
                e.stopPropagation();
                endDemo();
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Progress Bar */}
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 3,
            bgcolor: 'rgba(245,158,11,0.2)',
            '& .MuiLinearProgress-bar': { bgcolor: '#f59e0b' },
          }}
        />

        {/* Body */}
        <Collapse in={!collapsed}>
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.6, mb: 2 }}>
              {currentStep.instruction}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              {!isLastStep && (
                <Button
                  size="small"
                  startIcon={<SkipIcon />}
                  onClick={advanceStep}
                  sx={{
                    color: '#92400e',
                    fontSize: 12,
                    textTransform: 'none',
                    '&:hover': { bgcolor: 'rgba(245,158,11,0.1)' },
                  }}
                >
                  Skip
                </Button>
              )}
              {isLastStep ? (
                <Button
                  size="small"
                  variant="contained"
                  onClick={endDemo}
                  sx={{
                    bgcolor: '#f59e0b',
                    color: 'white',
                    fontSize: 12,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#d97706' },
                    boxShadow: 'none',
                  }}
                >
                  Finish Demo
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="contained"
                  endIcon={<NextIcon />}
                  onClick={advanceStep}
                  sx={{
                    bgcolor: '#f59e0b',
                    color: 'white',
                    fontSize: 12,
                    textTransform: 'none',
                    '&:hover': { bgcolor: '#d97706' },
                    boxShadow: 'none',
                  }}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>
        </Collapse>
      </Paper>
    </Box>
  );
};

export default DemoGuide;
