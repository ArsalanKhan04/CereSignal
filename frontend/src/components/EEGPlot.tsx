import React, { useCallback, useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  IconButton,
  Chip,
  Stack,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EventsData } from '../types';

const MONTAGE_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'bipolar_longitudinal', label: 'Bipolar - Longitudinal (Double Banana)' },
  { value: 'bipolar_transverse', label: 'Bipolar - Transverse' },
  { value: 'laplacian', label: 'Laplacian' },
];

interface EEGPlotProps {
  fileId: number;
  eventsData: EventsData | null;
}

const EEGPlot: React.FC<EEGPlotProps> = ({ fileId, eventsData }) => {
  const [plotStart, setPlotStart] = useState<number>(0);
  const [plotDuration, setPlotDuration] = useState<number>(10);
  const [montage, setMontage] = useState<string>('original');
  const [sensitivity, setSensitivity] = useState<number>(2.5);
  const [plotData, setPlotData] = useState<any | null>(null);
  const [plotLoading, setPlotLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchPlot = useCallback(async () => {
    if (!fileId) return;
    setPlotLoading(true);
    setError('');
    try {
      const resp = await apiClient.getPlotData(fileId, plotStart, plotDuration, undefined, montage);
      if (resp.status === 200) {
        setPlotData(resp.data.plot_data);
      } else {
        setError('Failed to load plot data');
      }
    } catch (err) {
      const errorMessage = err && typeof err === 'object'
        ? ((err as any).response?.data?.detail || (err as any).message)
        : undefined;
      setError(typeof errorMessage === 'string' ? errorMessage : 'Error loading plot data');
    } finally {
      setPlotLoading(false);
    }
  }, [fileId, plotStart, plotDuration, montage, sensitivity]);

  useEffect(() => {
    if (!fileId) return;
    const id = setTimeout(() => {
      fetchPlot();
    }, 300);
    return () => clearTimeout(id);
  }, [fileId, montage, plotStart, plotDuration, fetchPlot]);

  const computedPlot = useMemo(() => {
    if (!plotData?.channels?.length) return null;
    const channels = plotData.channels as Array<{ channel_name: string; data: number[] }>;
    const traces: any[] = [];
    const layout: any = {
      autosize: true,
      height: 1000,
      margin: { l: 70, r: 70, t: 60, b: 30 },
      plot_bgcolor: '#ffffff',
      showlegend: false,
      title: {
        text: `${eventsData?.filename || ''} (${plotStart}s - ${plotStart + plotDuration}s)`,
        font: { size: 16 },
        x: 0.01,
        xanchor: 'left',
      },
    };

    const times = plotData.times || [];
    const N = channels.length;
    const basePeaks = channels.map((ch) =>
      (ch.data || []).reduce((max, value) => Math.max(max, Math.abs(value)), 0)
    );
    const sensitivityScale = sensitivity * 1e6;
    const maxBasePeak = Math.max(...basePeaks, 1);
    const spacing = maxBasePeak * 3;
    const annotations: any[] = [];

    let globalMin = Infinity;
    let globalMax = -Infinity;

    channels.forEach((ch, idx) => {
      const data = (ch.data || []).map((value) => value * sensitivityScale);
      const offset = (N - idx - 1) * spacing;
      const shifted = data.map((value) => value + offset);

      globalMin = Math.min(globalMin, ...shifted);
      globalMax = Math.max(globalMax, ...shifted);

      traces.push({
        x: times,
        y: shifted,
        name: ch.channel_name,
        type: 'scatter',
        mode: 'lines',
        line: { color: montage === 'original' ? 'green' : '#1a237e', width: 1 },
        yaxis: 'y',
        showlegend: false,
      });

      if (montage === 'original') {
        const chEvents = eventsData?.events?.[ch.channel_name];
        if (chEvents) {
          Object.entries(chEvents).forEach(([etype, evlist]: any) => {
            evlist.forEach((ev: any) => {
              const [s, e] = ev;
              const xs: number[] = [];
              const ys: number[] = [];
              for (let i = 0; i < times.length; i++) {
                const t = times[i];
                if (t >= s && t <= e) {
                  xs.push(t);
                  ys.push(shifted[i]);
                }
              }
              if (xs.length) {
                const color = etype === 'spike wave' ? 'red' : etype === 'slow wave' ? '#ffb300' : 'green';
                traces.push({
                  x: xs,
                  y: ys,
                  name: `${ch.channel_name} (${etype})`,
                  type: 'scatter',
                  mode: 'lines',
                  line: { color, width: 2 },
                  yaxis: 'y',
                  showlegend: false,
                  hoverinfo: 'none',
                });
              }
            });
          });
        }
      }

      annotations.push({
        xref: 'paper',
        x: 1.01,
        yref: 'y',
        y: offset,
        text: ch.channel_name,
        showarrow: false,
        font: { size: 10, color: '#37474f' },
        xanchor: 'left',
      });
    });

    layout.annotations = annotations;
    layout.yaxis = {
      showline: true,
      zeroline: false,
      showgrid: true,
      showticklabels: false,
      range: [globalMin - spacing, globalMax + spacing],
    };

    layout.xaxis = {
      domain: [0, 1],
      anchor: 'y',
      showline: true,
      ticks: 'outside',
      ticklen: 4,
    };

    return { traces, layout };
  }, [plotData, eventsData, plotStart, plotDuration, montage, sensitivity]);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={{ pb: 2 }}>
        <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 1 }}>
            EEG Plot
          </Typography>

          {montage === 'original' && eventsData && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label="Normal" size="small" sx={{ bgcolor: '#2e7d32', color: '#fff' }} />
              <Chip label="Slow Waves" size="small" sx={{ bgcolor: '#ffb300', color: '#fff' }} />
              <Chip label="Spike Waves" size="small" sx={{ bgcolor: '#c62828', color: '#fff' }} />
            </Stack>
          )}

          <Box display="flex" alignItems="center" gap={0.5}>
            <IconButton size="small" onClick={() => setPlotStart((prev) => Math.max(0, prev - 10))}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <TextField
              label="Start"
              type="number"
              value={plotStart}
              onChange={(e) => setPlotStart(Number(e.target.value))}
              size="small"
              sx={{ width: 80 }}
              inputProps={{ step: 1 }}
            />
            <IconButton size="small" onClick={() => setPlotStart((prev) => prev + 10)}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Window</InputLabel>
            <Select
              value={plotDuration}
              label="Window"
              onChange={(e) => setPlotDuration(Number(e.target.value))}
            >
              {[5, 10, 20, 40].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}s
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Sensitivity"
            type="number"
            inputProps={{ step: 0.1, min: 0.1 }}
            value={sensitivity}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setSensitivity(Number.isFinite(parsed) ? Math.max(0.1, parsed) : 1);
            }}
            size="small"
            sx={{ width: 110 }}
          />

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Montage</InputLabel>
            <Select
              value={montage}
              label="Montage"
              onChange={(e) => setMontage(e.target.value)}
              MenuProps={{ PaperProps: { sx: { maxWidth: 320 } } }}
            >
              {MONTAGE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="contained"
            onClick={fetchPlot}
            disabled={plotLoading}
            sx={{ minWidth: 64, height: 28 }}
          >
            {plotLoading ? <CircularProgress size={14} /> : 'Load'}
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon fontSize="small" />}
            onClick={fetchPlot}
            sx={{ minWidth: 72, height: 28 }}
          >
            Refresh
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {computedPlot && (
          <Box sx={{ height: 1000, minWidth: 0 }}>
            <Plot
              data={computedPlot.traces}
              layout={computedPlot.layout}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default EEGPlot;
