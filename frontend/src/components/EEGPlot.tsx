import React, { useCallback, useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import Plotly from 'plotly.js-basic-dist';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Radio,
  RadioGroup
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Refresh as RefreshIcon,
  BookmarkAdd as BookmarkIcon,
} from '@mui/icons-material';
import { apiClient } from '../services/api';
import { EventsData, EEGBookmark } from '../types';

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
  const [bookmarks, setBookmarks] = useState<EEGBookmark[]>([]);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [bookmarkComment, setBookmarkComment] = useState('');
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [bookmarkError, setBookmarkError] = useState('');
  const [replaceBookmarkId, setReplaceBookmarkId] = useState<number | null>(null);
  const [plotInstance, setPlotInstance] = useState<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!fileId) return;
    const loadBookmarks = async () => {
      try {
        const response = await apiClient.getBookmarks(fileId);
        if (response.status === 200) {
          setBookmarks(response.data);
        }
      } catch (err) {
        console.error('Failed to load bookmarks:', err);
      }
    };

    loadBookmarks();
  }, [fileId]);

  const openBookmarkDialog = () => {
    setBookmarkComment('');
    setBookmarkError('');
    setReplaceBookmarkId(null);
    setBookmarkDialogOpen(true);
  };

  const handleBookmarkSave = async () => {
    if (!plotInstance) {
      setBookmarkError('Plot not ready for capture.');
      return;
    }

    setBookmarkSaving(true);
    setBookmarkError('');

    try {
      const imageData = await Plotly.toImage(plotInstance, { format: 'png', height: 1000, width: 1600 });
      const response = await apiClient.createBookmark(fileId, {
        image_base64: imageData,
        comment: bookmarkComment.trim() || undefined,
        replace_id: replaceBookmarkId || undefined,
      });

      if (response.status === 201) {
        const refresh = await apiClient.getBookmarks(fileId);
        if (refresh.status === 200) {
          setBookmarks(refresh.data);
        }
        setBookmarkDialogOpen(false);
      } else {
        setBookmarkError('Failed to save bookmark.');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to save bookmark.';
      setBookmarkError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setBookmarkSaving(false);
    }
  };

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

           <Button
             size="small"
             variant="outlined"
             startIcon={<BookmarkIcon fontSize="small" />}
             onClick={openBookmarkDialog}
             disabled={!computedPlot}
             sx={{ minWidth: 120, height: 28 }}
           >
             Bookmark View
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
              onInitialized={(_: any, graphDiv: HTMLElement) => setPlotInstance(graphDiv)}
              onUpdate={(_: any, graphDiv: HTMLElement) => setPlotInstance(graphDiv)}
            />
          </Box>
        )}

        {bookmarks.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Saved Bookmarks
            </Typography>
            <Stack spacing={2}>
              {bookmarks.map((bookmark) => (
                <Card key={bookmark.id} variant="outlined">
                  <CardContent sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Box
                        component="img"
                        src={`${apiClient.getPublicBaseUrl()}${bookmark.image_url}`}
                        alt="EEG bookmark"
                        sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {bookmark.comment || 'No comment provided.'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(bookmark.created_at).toLocaleString()}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        )}

        <Dialog open={bookmarkDialogOpen} onClose={() => setBookmarkDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Bookmark Current View</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {bookmarkError && <Alert severity="error">{bookmarkError}</Alert>}
              <TextField
                label="Comment"
                value={bookmarkComment}
                onChange={(e) => setBookmarkComment(e.target.value)}
                placeholder="Add a note for this snapshot"
                fullWidth
                multiline
                minRows={2}
              />
              {bookmarks.length >= 2 && (
                <RadioGroup
                  value={replaceBookmarkId ?? ''}
                  onChange={(e) => setReplaceBookmarkId(Number(e.target.value))}
                >
                  {bookmarks.map((bookmark) => (
                    <FormControlLabel
                      key={bookmark.id}
                      value={bookmark.id}
                      control={<Radio />}
                      label={`Replace bookmark from ${new Date(bookmark.created_at).toLocaleString()}`}
                    />
                  ))}
                </RadioGroup>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBookmarkDialogOpen(false)} disabled={bookmarkSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleBookmarkSave}
              variant="contained"
              disabled={bookmarkSaving}
            >
              {bookmarkSaving ? <CircularProgress size={18} color="inherit" /> : 'Save Bookmark'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default EEGPlot;
