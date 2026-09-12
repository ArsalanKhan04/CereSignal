import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { apiClient } from '../services/api';
import { SignalFile, EventsData } from '../types';
import EEGPlot from './EEGPlot';
import TopographicMap from './TopographicMap';
import { useConfig } from '../contexts/ConfigContext';

const Events: React.FC = () => {
  const { aiInferenceEnabled } = useConfig();
  const [files, setFiles] = useState<SignalFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | ''>('');
  const [eventsData, setEventsData] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState<string>('');


  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getFiles();
      if (response.status === 200) {
        // Only show processed files (not processing)
        const processedFiles = response.data.filter(file => file.condition !== 'processing');
        setFiles(processedFiles);
      } else {
        setError('Failed to load files');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading files';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    if (!selectedFileId) {
      setError('Please select a file first');
      return;
    }

    setEventsLoading(true);
    setError('');
    
    try {
      const response = await apiClient.getFileEvents(selectedFileId as number);
      if (response.status === 200) {
        setEventsData(response.data);
      } else {
        setError('Failed to load events data');
      }


    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading events';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setEventsLoading(false);
    }
  };



  const getFileDisplayName = (file: SignalFile) => {
    const uploadDate = new Date(file.upload_time).toLocaleDateString();
    return `${file.user_name || 'Unknown Patient'} - ${file.filename} (${uploadDate})`;
  };




  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        EEG Events Analysis
      </Typography>

      {/* File Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Select EEG File for Event Analysis
          </Typography>
          <Box display="flex" gap={2} alignItems="end">
            <FormControl fullWidth>
              <InputLabel>Choose File</InputLabel>
              <Select
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value as number)}
                label="Choose File"
              >
                {files.map((file) => (
                  <MenuItem key={file.id} value={file.id}>
                    {getFileDisplayName(file)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadFiles}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={loadEvents}
              disabled={!selectedFileId || eventsLoading}
            >
              {eventsLoading ? <CircularProgress size={20} /> : 'Load Events'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {eventsData && (
        <Box>
          {/* File Info Header */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                File: {eventsData.filename}
              </Typography>
              <Typography variant="h6" color="textSecondary">
                Condition: <Chip label={eventsData.condition.toUpperCase()} color="primary" />
              </Typography>
            </CardContent>
          </Card>

          <EEGPlot fileId={selectedFileId as number} eventsData={eventsData} />

          {!eventsData.events || Object.keys(eventsData.events).length === 0 ? (
            <Card>
              <CardContent>
                <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
                  No events data available for this file
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Box>
              {/* Events Summary */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Events Summary
                  </Typography>
                  <EventsSummary events={eventsData.events} />
                </CardContent>
              </Card>

              {/* Topomap is derived from NeuroTransformer events — nothing to plot
                  when AI inference is disabled. */}
              {aiInferenceEnabled && <TopographicMap fileId={selectedFileId as number} />}

            </Box>
          )}
        </Box>
      )}

    </Box>
  );
};

// Events Summary Component
interface EventsSummaryProps {
  events: Record<string, Record<string, Array<[number, number]>>>;
}

const EventsSummary: React.FC<EventsSummaryProps> = ({ events }) => {
  // Sum durations in seconds for each event type across all channels
  let normalSec = 0;
  let spikeSec = 0;
  let slowSec = 0;

  Object.values(events).forEach(channelEvents => {
    Object.entries(channelEvents).forEach(([eventType, eventList]) => {
      eventList.forEach((ev) => {
        const [s, e] = ev;
        const dur = Math.max(0, e - s);
        if (eventType === 'normal wave') normalSec += dur;
        else if (eventType === 'spike wave') spikeSec += dur;
        else if (eventType === 'slow wave') slowSec += dur;
      });
    });
  });

  const totalSec = normalSec + spikeSec + slowSec;

  const fmt = (v: number) => v.toFixed(1) + 's';

  return (
    <Grid container spacing={3} justifyContent="center">
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="primary">
            {fmt(totalSec)}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Total Event Duration
          </Typography>
        </Box>
      </Grid>
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="success.main">
            {fmt(normalSec)}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Normal Waves (total)
          </Typography>
        </Box>
      </Grid>
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="error.main">
            {fmt(spikeSec)}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Spike Waves (total)
          </Typography>
        </Box>
      </Grid>
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="warning.main">
            {fmt(slowSec)}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Slow Waves (total)
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
};



export default Events;