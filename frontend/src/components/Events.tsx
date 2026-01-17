import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
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
  TextField,
  Checkbox,
  FormControlLabel,
  IconButton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
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

  // Plot state
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [activePlotData, setActivePlotData] = useState<any | null>(null);
  const activePlotRef = React.useRef<any | null>(null);
  const [incomingPlotData, setIncomingPlotData] = useState<any | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionDuration = 300; // ms
  const [plotLoading, setPlotLoading] = useState(false);
  const [plotStart, setPlotStart] = useState<number>(0);
  const [plotDuration, setPlotDuration] = useState<number>(10);
  const [amplitudeScale, setAmplitudeScale] = useState<number>(1);
  const [decimation, setDecimation] = useState<number>(1);
  const [frequency, setFrequency] = useState<number>(100);

  React.useEffect(() => { activePlotRef.current = activePlotData; }, [activePlotData]);

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

      // Also load channel list for plotting
      try {
        const sigResp = await apiClient.getFileSignals(selectedFileId as number);
        if (sigResp.status === 200) {
          const sigs = sigResp.data as any[];
          const names = sigs.map(s => s.channel_name);
          setAvailableChannels(names);
          setSelectedChannels(names.slice(0, Math.min(3, names.length)));
        }
      } catch (e) {
        // ignore channel load errors
      }

    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading events';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchPlot = React.useCallback(async (start = plotStart, duration = plotDuration) => {
    if (!selectedFileId) return;
    setPlotLoading(true);
    try {
      const chanParam = selectedChannels.length ? selectedChannels.join(',') : undefined;
      const resp = await apiClient.getPlotData(selectedFileId as number, start, duration, chanParam);
      if (resp.status === 200) {
        const newData = resp.data.plot_data;
        // If no active plot yet, set immediately
        if (!activePlotRef.current) {
          setActivePlotData(newData);
        } else {
          // prepare incoming and transition
          setIncomingPlotData(newData);
          setIsTransitioning(true);
          // after transition, make incoming the active
          setTimeout(() => {
            setActivePlotData(newData);
            setIncomingPlotData(null);
            setIsTransitioning(false);
          }, transitionDuration);
        }
      } else {
        setError('Failed to load plot data');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error loading plot data';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setPlotLoading(false);
    }
  }, [selectedFileId, selectedChannels, plotStart, plotDuration]);

  React.useEffect(() => {
    if (!selectedFileId) return;
    const id = setTimeout(() => {
      fetchPlot(plotStart, plotDuration);
    }, 500);
    return () => clearTimeout(id);
  }, [plotStart, plotDuration, selectedChannels, selectedFileId, fetchPlot]);

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

  const computePlotFrom = (data: any) => {
    if (!data) return null;
    const channels = data.channels || [];
    const channelsToPlot = channels.filter((ch: any) => selectedChannels.length ? selectedChannels.includes(ch.channel_name) : true);
    const N = channelsToPlot.length || 0;
    const traces: any[] = [];

    let totalEvents = 0;
    let spikeCount = 0;
    let slowCount = 0;
    let normalCount = 0;

    const layout: any = {
      autosize: true,
      height: 700,
      title: `${eventsData?.filename || ''} (${plotStart}s - ${plotStart + plotDuration}s)`,
      margin: { l: 60, r: 40, t: 80, b: 30 },
      plot_bgcolor: '#ffffff',
    };

    channelsToPlot.forEach((ch: any, idx: number) => {
      // decimate and scale data
      const timesDec: number[] = [];
      const dataDec: number[] = [];
      let peak = 0;
      for (let i = 0; i < data.times.length; i++) {
        const val = ch.data[i] ?? 0;
        if (Math.abs(val) > peak) peak = Math.abs(val);
        if (i % decimation === 0) {
          timesDec.push(data.times[i]);
          dataDec.push(val * amplitudeScale);
        }
      }

      // main trace in green
      traces.push({
        x: timesDec,
        y: dataDec,
        name: ch.channel_name,
        type: 'scatter',
        mode: 'lines',
        line: { color: 'green', width: 1 },
        yaxis: 'y' + (idx + 1),
        showlegend: false,
      });

      // overlay event segments with colors
      const chEvents = eventsData?.events?.[ch.channel_name];
      if (chEvents) {
        Object.entries(chEvents).forEach(([etype, evlist]: any) => {
          evlist.forEach((ev: any) => {
            const [s, e] = ev;
            const xs: number[] = [];
            const ys: number[] = [];
            for (let i = 0; i < timesDec.length; i++) {
              const t = timesDec[i];
              if (t >= s && t <= e) {
                xs.push(t);
                ys.push(dataDec[i]);
              }
            }
            if (xs.length) {
              const color = etype === 'spike wave' ? 'red' : etype === 'slow wave' ? 'yellow' : 'green';
              traces.push({
                x: xs,
                y: ys,
                name: `${ch.channel_name} (${etype})`,
                type: 'scatter',
                mode: 'lines',
                line: { color, width: 3 },
                yaxis: 'y' + (idx + 1),
                showlegend: false,
                hoverinfo: 'none',
              });

              if (etype === 'spike wave') spikeCount++;
              else if (etype === 'slow wave') slowCount++;
              else normalCount++;
              totalEvents++;
            }
          });
        });
      }

      // stacked axis domain (top to bottom)
      const domainStart = (N - idx - 1) / N;
      const domainEnd = (N - idx) / N;
      const key = idx === 0 ? 'yaxis' : 'yaxis' + (idx + 1);
      const rangeHalf = (peak || 1) * 1.2;
      layout[key] = {
        domain: [domainStart, domainEnd],
        anchor: 'x',
        showline: true,
        zeroline: false,
        showgrid: true,
        title: { text: ch.channel_name, standoff: 24 },
        side: 'right',
        autorange: false,
        range: [-rangeHalf, rangeHalf],
        showticklabels: false,
      };
    });

    // ensure x-axis sits at the bottom (anchor to last y-axis)
    if (N > 0) {
      layout.xaxis = {
        domain: [0, 1],
        anchor: 'y' + N,
        showline: true,
        ticks: 'outside',
        ticklen: 4,
      };
    } else {
      layout.xaxis = { domain: [0,1], showline: true };
    }

    // hide legend (we use axis titles instead)
    layout.showlegend = false;

    // add summary annotation on top of the plot
    const summaryText = `Total events: ${totalEvents} — Spike: ${spikeCount} — Slow: ${slowCount}`;
    layout.annotations = [
      {
        xref: 'paper', x: 0.01,
        yref: 'paper', y: 1.02,
        xanchor: 'left',
        yanchor: 'bottom',
        text: summaryText,
        showarrow: false,
        align: 'left',
        bgcolor: 'rgba(255,255,255,0.8)',
      }
    ];

    return { traces, layout };
  };

  const computedPlot = React.useMemo(() => computePlotFrom(activePlotData), [activePlotData, plotStart, plotDuration, eventsData, selectedChannels, amplitudeScale, decimation]);

  const incomingComputedPlot = React.useMemo(() => computePlotFrom(incomingPlotData), [incomingPlotData, plotStart, plotDuration, eventsData, selectedChannels, amplitudeScale, decimation]);

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

          {/* Plot Controls & Plot */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Plot Time-Series
              </Typography>

              <Box display="flex" gap={2} alignItems="center" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <IconButton size="small" onClick={() => setPlotStart(prev => Math.max(0, prev - 10))} aria-label="shift-left">
                    <ChevronLeftIcon />
                  </IconButton>
                  <TextField
                    label="Start (s)"
                    type="number"
                    value={plotStart}
                    onChange={(e) => setPlotStart(Number(e.target.value))}
                    size="small"
                    sx={{ width: 120 }}
                  />
                  <IconButton size="small" onClick={() => setPlotStart(prev => prev + 10)} aria-label="shift-right">
                    <ChevronRightIcon />
                  </IconButton>
                </Box>
                <TextField
                  label="Duration (s)"
                  type="number"
                  value={plotDuration}
                  onChange={(e) => setPlotDuration(Number(e.target.value))}
                  size="small"
                  sx={{ width: 120 }}
                />

                <TextField
                  label="Frequency (Hz)"
                  type="number"
                  value={frequency}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    const v = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
                    setFrequency(v);
                    setDecimation(Math.max(1, Math.round(100 / v)));
                  }}
                  size="small"
                  sx={{ width: 140 }}
                />

                <TextField
                  label="Amplitude Scale"
                  type="number"
                  inputProps={{ step: 0.1 }}
                  value={amplitudeScale}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    setAmplitudeScale(Number.isFinite(parsed) ? parsed : 1);
                  }}
                  size="small"
                  sx={{ width: 150 }}
                />

                <TextField
                  label="Decimation"
                  type="number"
                  value={decimation}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    const v = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
                    setDecimation(v);
                    setFrequency(Math.max(1, Math.round(100 / v)));
                  }}
                  size="small"
                  sx={{ width: 120 }}
                />

                <Box>
                  <Typography variant="caption" color="textSecondary">Select channels using the checkboxes beside the plot.</Typography>
                </Box>

                <Button
                  variant="contained"
                  onClick={() => fetchPlot()}
                >
                  {plotLoading ? <CircularProgress size={20} /> : 'Load Plot'}
                </Button>
              </Box>

              {(activePlotData || incomingPlotData) && (computedPlot || incomingComputedPlot) && (
                <Box display="flex" gap={2} alignItems="flex-start">
                  <Box flex={1} sx={{ height: 700, minWidth: 0, position: 'relative' }}>
                    {computedPlot && (
                      <Box
                        sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        style={{ opacity: isTransitioning ? 0 : 1, transition: `opacity ${transitionDuration}ms ease` }}
                      >
                        <Plot
                          data={computedPlot.traces}
                          layout={computedPlot.layout}
                          useResizeHandler
                          style={{ width: '100%', height: '100%' }}
                          key={JSON.stringify(activePlotData?.times?.slice(0,5) || [])}
                        />
                      </Box>
                    )}

                    {incomingComputedPlot && (
                      <Box
                        sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        style={{ opacity: isTransitioning ? 1 : 0, transition: `opacity ${transitionDuration}ms ease` }}
                      >
                        <Plot
                          data={incomingComputedPlot.traces}
                          layout={incomingComputedPlot.layout}
                          useResizeHandler
                          style={{ width: '100%', height: '100%' }}
                          key={JSON.stringify(incomingPlotData?.times?.slice(0,5) || [])}
                        />
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ width: 180, maxHeight: 700, overflow: 'auto', pr:0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.25, ml: 'auto', alignItems: 'start', mt: 15 }}>
                    {availableChannels.map((ch: string) => (
                      <FormControlLabel
                        key={ch}
                        sx={{ width: '100%', py: 0, px: 0, m: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedChannels.includes(ch)}
                            onChange={() => {
                              setSelectedChannels(prev =>
                                prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
                              );
                            }}
                          />
                        }
                        label={ch}
                      />
                    ))}
                  </Box>
                </Box>
              )}
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

              {/* Topomap visualization (generated by backend during inference) */}
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Topographic Map
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <img
                      src={`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1'}/signals/files/${selectedFileId}/topomap`}
                      alt="Topographic Map"
                      style={{ maxWidth: '100%', height: 'auto' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </Box>
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