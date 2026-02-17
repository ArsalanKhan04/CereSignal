import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
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
  Tooltip,
  Divider
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Refresh as RefreshIcon,
  BookmarkAdd as BookmarkIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
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
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [plotLoading, setPlotLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookmarks, setBookmarks] = useState<EEGBookmark[]>([]);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [bookmarkComment, setBookmarkComment] = useState('');
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [bookmarkError, setBookmarkError] = useState('');
  const [bookmarkDeletingId, setBookmarkDeletingId] = useState<number | null>(null);
  const [plotInstance, setPlotInstance] = useState<HTMLElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotCacheRef = useRef<Map<string, any>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  const MAX_CACHE_ENTRIES = 8;

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const buildCacheKey = useCallback(
    (start: number, duration: number, montageName: string) => `${fileId}-${start}-${duration}-${montageName}`,
    [fileId]
  );

  const setCache = (key: string, value: any) => {
    const cache = plotCacheRef.current;
    if (cache.has(key)) {
      cache.delete(key);
    }
    cache.set(key, value);
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
  };

  const fetchPlot = useCallback(async (options?: { startOverride?: number; force?: boolean; background?: boolean }) => {
    if (!fileId) return;
    const start = options?.startOverride ?? plotStart;
    const cacheKey = buildCacheKey(start, plotDuration, montage);
    if (!options?.force) {
      const cached = plotCacheRef.current.get(cacheKey);
      if (cached) {
        setPlotData(cached);
        return;
      }
    }
    if (inflightRef.current.has(cacheKey)) {
      return;
    }
    inflightRef.current.add(cacheKey);
    if (!options?.background) {
      setPlotLoading(true);
      setError('');
    }
    try {
      const resp = await apiClient.getPlotData(fileId, start, plotDuration, undefined, montage);
      if (resp.status === 200) {
        const plotPayload = resp.data.plot_data;
        setCache(cacheKey, plotPayload);
        setPlotData(plotPayload);
        if (typeof plotPayload?.total_duration === 'number') {
          setTotalDuration(plotPayload.total_duration);
        }
      } else {
        if (!options?.background) {
          setError('Failed to load plot data');
        }
      }
    } catch (err) {
      if (!options?.background) {
        const errorMessage = err && typeof err === 'object'
          ? ((err as any).response?.data?.detail || (err as any).message)
          : undefined;
        setError(typeof errorMessage === 'string' ? errorMessage : 'Error loading plot data');
      }
    } finally {
      inflightRef.current.delete(cacheKey);
      if (!options?.background) {
        setPlotLoading(false);
      }
    }
  }, [fileId, plotStart, plotDuration, montage, buildCacheKey]);

  useEffect(() => {
    if (!fileId) return;
    fetchPlot();
  }, [fileId, montage, plotStart, plotDuration, fetchPlot]);

  useEffect(() => {
    if (!fileId || totalDuration !== null) return;
    let isActive = true;
    const loadTotalDuration = async () => {
      try {
        const response = await apiClient.getSignalData(fileId, 0, 1);
        if (response.status === 200) {
          const duration = response.data?.file_info?.total_duration;
          if (isActive && typeof duration === 'number') {
            setTotalDuration(duration);
          }
        }
      } catch (err) {
        console.error('Failed to load total duration:', err);
      }
    };

    loadTotalDuration();
    return () => {
      isActive = false;
    };
  }, [fileId, totalDuration]);

  const goToStart = useCallback((nextStart: number) => {
    const durationLimit = totalDuration ?? Infinity;
    const rawMaxStart = Math.max(0, durationLimit - plotDuration);
    const maxStart = Number.isFinite(rawMaxStart)
      ? Math.floor(rawMaxStart / plotDuration) * plotDuration
      : rawMaxStart;
    if (Number.isFinite(maxStart) && nextStart > maxStart) {
      setEndReached(true);
    } else {
      setEndReached(false);
    }
    const clampedStart = Math.max(0, Math.min(nextStart, maxStart));
    const snappedStart = Math.floor(clampedStart / plotDuration) * plotDuration;
    const cacheKey = buildCacheKey(snappedStart, plotDuration, montage);
    const cached = plotCacheRef.current.get(cacheKey);
    if (cached) {
      setPlotData(cached);
    }
    setPlotStart(snappedStart);
  }, [buildCacheKey, plotDuration, montage, totalDuration]);

  useEffect(() => {
    if (totalDuration === null) return;
    const durationLimit = totalDuration ?? Infinity;
    const rawMaxStart = Math.max(0, durationLimit - plotDuration);
    const maxStart = Number.isFinite(rawMaxStart)
      ? Math.floor(rawMaxStart / plotDuration) * plotDuration
      : rawMaxStart;
    if (plotStart > maxStart) {
      goToStart(maxStart);
    }
  }, [totalDuration, plotDuration, plotStart, goToStart]);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys when not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToStart(Math.max(0, plotStart - plotDuration));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToStart(plotStart + plotDuration);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [plotDuration, plotStart, goToStart]);

  useEffect(() => {
    if (!fileId) return;
    if (totalDuration !== null && plotStart + plotDuration >= totalDuration) return;
    const nextStart = plotStart + plotDuration;
    const nextKey = buildCacheKey(nextStart, plotDuration, montage);
    if (!plotCacheRef.current.has(nextKey) && !inflightRef.current.has(nextKey)) {
      fetchPlot({ startOverride: nextStart, background: true });
    }
  }, [fileId, plotStart, plotDuration, montage, buildCacheKey, fetchPlot, totalDuration]);

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

  const handleBookmarkDelete = async (bookmarkId: number) => {
    setBookmarkDeletingId(bookmarkId);
    setBookmarkError('');
    try {
      const response = await apiClient.deleteBookmark(fileId, bookmarkId);
      if (response.status === 200) {
        setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== bookmarkId));
      } else {
        setBookmarkError('Failed to delete bookmark.');
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to delete bookmark.';
      setBookmarkError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
    } finally {
      setBookmarkDeletingId(null);
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
        font: { size: 16, color: '#1f2937', family: 'Arial Black, Arial, sans-serif' },
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
    <Card ref={containerRef} sx={{ mb: 3, bgcolor: isFullscreen ? '#fff' : undefined }}>
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
            <Tooltip title="Previous window (Left Arrow)">
              <IconButton size="small" onClick={() => goToStart(Math.max(0, plotStart - plotDuration))}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <TextField
              label="Start"
              type="number"
              value={plotStart}
              onChange={(e) => goToStart(Number(e.target.value))}
              onBlur={(e) => goToStart(Number(e.target.value))}
              size="small"
              sx={{ width: 100 }}
              inputProps={{
                step: 1,
                min: 0,
                max: totalDuration ? Math.max(0, totalDuration - plotDuration) : undefined,
              }}
            />
            <Tooltip title="Next window (Right Arrow)">
              <IconButton
                size="small"
                onClick={() => goToStart(plotStart + plotDuration)}
                disabled={totalDuration !== null && plotStart + plotDuration >= totalDuration}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          {totalDuration !== null && (
            <Typography variant="caption" color="text.secondary">
              / {Math.max(0, totalDuration - plotDuration).toFixed(0)}s
            </Typography>
          )}

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
              onClick={() => fetchPlot({ force: true })}
              disabled={plotLoading}
              sx={{ minWidth: 64, height: 28 }}
            >
              {plotLoading ? <CircularProgress size={14} /> : 'Load'}
            </Button>

            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon fontSize="small" />}
              onClick={() => fetchPlot({ force: true })}
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

           <Tooltip title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'}>
             <IconButton size="small" onClick={toggleFullscreen}>
               {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
             </IconButton>
           </Tooltip>

           <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
             Use arrow keys to navigate
           </Typography>
         </Box>


        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {computedPlot && (
          <Box sx={{ height: isFullscreen ? 'calc(100vh - 120px)' : 1000, minWidth: 0 }}>
            <Plot
              data={computedPlot.traces}
              layout={{ ...computedPlot.layout, height: isFullscreen ? window.innerHeight - 120 : 1000 }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onInitialized={(_: any, graphDiv: HTMLElement) => setPlotInstance(graphDiv)}
              onUpdate={(_: any, graphDiv: HTMLElement) => setPlotInstance(graphDiv)}
            />
            {endReached && (
              <Divider sx={{ mt: 2 }} textAlign="center">
                <Typography variant="caption" color="text.secondary">
                  End of recording
                </Typography>
              </Divider>
            )}
          </Box>
        )}

        <Dialog
          open={bookmarkDialogOpen}
          onClose={() => setBookmarkDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          fullScreen={false}
          disablePortal={isFullscreen}
          container={isFullscreen ? containerRef.current : undefined}
          PaperProps={{
            sx: {
              maxHeight: isFullscreen ? '80vh' : undefined,
              width: isFullscreen ? 'min(720px, 92vw)' : undefined,
            },
          }}
        >
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
              <Box sx={{ pt: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Saved Bookmarks
                </Typography>
                {bookmarks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No bookmarks saved yet.
                  </Typography>
                ) : (
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
                            {bookmark.comment && (
                              <Typography variant="body2" color="text.secondary">
                                {bookmark.comment}
                              </Typography>
                            )}
                            <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
                              <Typography variant="caption" color="text.secondary">
                                {new Date(bookmark.created_at).toLocaleString()}
                              </Typography>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                onClick={() => handleBookmarkDelete(bookmark.id)}
                                disabled={bookmarkDeletingId === bookmark.id}
                                sx={{ minWidth: 96 }}
                              >
                                {bookmarkDeletingId === bookmark.id ? 'Deleting...' : 'Remove'}
                              </Button>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>
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
