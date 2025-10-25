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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { SignalFile, EventsData } from '../types';

const Events: React.FC = () => {
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

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'normal wave': return 'success';
      case 'spike wave': return 'error';
      case 'slow wave': return 'warning';
      default: return 'default';
    }
  };

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'normal wave': return '🌊';
      case 'spike wave': return '⚡';
      case 'slow wave': return '🐌';
      default: return '📊';
    }
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

              {/* Events by Channel */}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Events by Channel
                  </Typography>
                  <EventsByChannel 
                    events={eventsData.events}
                    getEventTypeColor={getEventTypeColor}
                    getEventTypeIcon={getEventTypeIcon}
                  />
                </CardContent>
              </Card>
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
  const totalEvents = Object.values(events).reduce((total, channelEvents) => {
    return total + Object.values(channelEvents).reduce((channelTotal, eventList) => {
      return channelTotal + eventList.length;
    }, 0);
  }, 0);

  const eventTypes = {
    'normal wave': 0,
    'spike wave': 0,
    'slow wave': 0,
  };

  Object.values(events).forEach(channelEvents => {
    Object.entries(channelEvents).forEach(([eventType, eventList]) => {
      if (eventType in eventTypes) {
        eventTypes[eventType as keyof typeof eventTypes] += eventList.length;
      }
    });
  });

  return (
    <Grid container spacing={3} justifyContent="center">
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="primary">
            {totalEvents}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Total Events
          </Typography>
        </Box>
      </Grid>
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="success.main">
            {eventTypes['normal wave']}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Normal Waves
          </Typography>
        </Box>
      </Grid>
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="error.main">
            {eventTypes['spike wave']}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Spike Waves
          </Typography>
        </Box>
      </Grid>
      <Grid>
        <Box textAlign="center">
          <Typography variant="h3" color="warning.main">
            {eventTypes['slow wave']}
          </Typography>
          <Typography variant="h6" color="textSecondary">
            Slow Waves
          </Typography>
        </Box>
      </Grid>
    </Grid>
  );
};

// Events by Channel Component
interface EventsByChannelProps {
  events: Record<string, Record<string, Array<[number, number]>>>;
  getEventTypeColor: (eventType: string) => any;
  getEventTypeIcon: (eventType: string) => string;
}

const EventsByChannel: React.FC<EventsByChannelProps> = ({ 
  events, 
  getEventTypeColor, 
  getEventTypeIcon 
}) => {
  return (
    <Box>
      {Object.entries(events).map(([channelName, channelEvents]) => (
        <Accordion key={channelName} sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Channel: {channelName}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              {/* Normal waves */}
              <Grid sx={{ xs: 12, md: 4 }}>
                <EventTypeCard
                  eventType="normal wave"
                  events={channelEvents['normal wave'] || []}
                  color="success"
                  icon="🌊"
                />
              </Grid>
              {/* Spike waves */}
              <Grid sx={{ xs: 12, md: 4 }}>
                <EventTypeCard
                  eventType="spike wave"
                  events={channelEvents['spike wave'] || []}
                  color="error"
                  icon="⚡"
                />
              </Grid>
              {/* Slow waves */}
              <Grid sx={{ xs: 12, md: 4 }}>
                <EventTypeCard
                  eventType="slow wave"
                  events={channelEvents['slow wave'] || []}
                  color="warning"
                  icon="🐌"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

// Event Type Card Component
interface EventTypeCardProps {
  eventType: string;
  events: Array<[number, number]>;
  color: 'success' | 'error' | 'warning';
  icon: string;
}

const EventTypeCard: React.FC<EventTypeCardProps> = ({ eventType, events, color, icon }) => {
  return (
    <Card 
      variant="outlined" 
      sx={{ 
        height: '100%',
        borderLeft: 4,
        borderLeftColor: `${color}.main`,
        bgcolor: `${color}.50`,
      }}
    >
      <CardContent>
        <Typography variant="h6" color={`${color}.main`} gutterBottom>
          {icon} {eventType.charAt(0).toUpperCase() + eventType.slice(1)} ({events.length} events)
        </Typography>
        
        {events.length === 0 ? (
          <Typography color="textSecondary" align="center" sx={{ py: 2 }}>
            No events of this type
          </Typography>
        ) : (
          <Box>
            {events.slice(0, 15).map((event, index) => {
              const [startTime, endTime] = event;
              const duration = endTime - startTime;
              return (
                <Box
                  key={index}
                  sx={{
                    p: 1,
                    mb: 1,
                    bgcolor: 'white',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'grey.300',
                  }}
                >
                  <Typography variant="body2">
                    Event {index + 1}: {startTime.toFixed(1)}s - {endTime.toFixed(1)}s 
                    (Duration: {duration.toFixed(1)}s)
                  </Typography>
                </Box>
              );
            })}
            {events.length > 15 && (
              <Typography color="textSecondary" align="center" sx={{ py: 1 }}>
                ... and {events.length - 15} more events
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default Events;