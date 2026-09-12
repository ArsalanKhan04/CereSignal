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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import BookmarkIcon from '@mui/icons-material/BookmarkAdd';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { apiClient } from '../services/api';
import { EventsData, EEGBookmark, FocusPoint } from '../types';

const MONTAGE_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'bipolar_longitudinal', label: 'Bipolar - Longitudinal (Double Banana)' },
  { value: 'bipolar_transverse', label: 'Bipolar - Transverse' },
  { value: 'laplacian', label: 'Laplacian' },
];

interface EEGPlotProps {
  fileId: number;
  eventsData: EventsData | null;
  // Where AI analysis has got to for this file. Viewer-level vocabulary on purpose — the
  // parent owns the mapping from the inference-status endpoint's Celery states.
  analysisStatus?: 'running' | 'done' | 'failed';
}

const EEGPlot: React.FC<EEGPlotProps> = ({ fileId, eventsData, analysisStatus }) => {
  const [plotStart, setPlotStart] = useState<number>(0);
  const [plotDuration, setPlotDuration] = useState<number>(10);
  const [montage, setMontage] = useState<string>('original');
  const [sensitivity, setSensitivity] = useState<number>(2.5);
  const [plotData, setPlotData] = useState<any | null>(null);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const [plotLoading, setPlotLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
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

  const focusPoints: FocusPoint[] = useMemo(
    () => (eventsData as any)?.focus_points || [],
    [eventsData]
  );

  // While inference is still running the events endpoint returns {events: {}, focus_points: []}
  // — an object, not null — so a plain `eventsData &&` check would show the legend for
  // highlights that do not exist yet.
  const hasEvents = useMemo(
    () => Object.keys(eventsData?.events || {}).length > 0,
    [eventsData]
  );

  const plotCacheRef = useRef<Map<string, any>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  // The window the viewer currently wants. Responses that no longer match it are cached
  // but not drawn, which keeps background prefetches and abandoned foreground requests
  // from redrawing the plot out from under the title.
  const currentKeyRef = useRef<string>('');
  // Foreground requests in flight. A plain boolean would be cleared by whichever request
  // finished first, re-enabling the Load button while another was still running.
  const fgCountRef = useRef(0);
  const MAX_CACHE_ENTRIES = 8;
  const PREPARE_POLL_MS = 2000;
  const PREPARE_TIMEOUT_MS = 60000;

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
    // A forced fetch must go through even if a background prefetch already holds the key,
    // otherwise clicking Load during a prefetch does nothing at all.
    if (!options?.force && inflightRef.current.has(cacheKey)) {
      return;
    }
    inflightRef.current.add(cacheKey);
    if (!options?.background) {
      fgCountRef.current += 1;
      setPlotLoading(true);
      setError('');
    }
    try {
      const resp = await apiClient.getPlotData(fileId, start, plotDuration, undefined, montage);
      if (resp.status === 200) {
        preparingRef.current = false;
        setPreparing(false);
        const plotPayload = resp.data.plot_data;
        setCache(cacheKey, plotPayload);
        // Prefetches and responses for a window we have already navigated away from fill
        // the cache only — drawing them would swap the plot without moving the title.
        if (cacheKey === currentKeyRef.current) {
          setPlotData(plotPayload);
        }
        if (typeof plotPayload?.total_duration === 'number') {
          setTotalDuration(plotPayload.total_duration);
        }
      } else {
        if (!options?.background) {
          setError('Failed to load plot data');
        }
      }
    } catch (err) {
      if ((err as any)?.response?.status === 409) {
        // Still awaiting EDF conversion. Foreground only: a prefetch of the next
        // window must not put the whole viewer into the preparing state. Leave
        // plotData alone so an already-drawn plot is never blanked.
        if (!options?.background) {
          preparingRef.current = true;
          setPreparing(true);
        }
        return;
      }
      if (!options?.background) {
        const errorMessage = err && typeof err === 'object'
          ? ((err as any).response?.data?.detail || (err as any).message)
          : undefined;
        setError(typeof errorMessage === 'string' ? errorMessage : 'Error loading plot data');
      }
    } finally {
      inflightRef.current.delete(cacheKey);
      if (!options?.background) {
        fgCountRef.current = Math.max(0, fgCountRef.current - 1);
        if (fgCountRef.current === 0) {
          setPlotLoading(false);
        }
      }
    }
  }, [fileId, plotStart, plotDuration, montage, buildCacheKey]);

  // The raw -> processed path swap happens only inside the inference-status endpoint,
  // so the viewer has to drive it: nudge status, then retry the plot. If the chain has
  // already finished and the file still isn't viewable, conversion failed and no amount
  // of waiting will help.
  useEffect(() => {
    if (!preparing || !fileId) return undefined;
    let cancelled = false;
    const deadline = Date.now() + PREPARE_TIMEOUT_MS;

    const giveUp = () => {
      preparingRef.current = false;
      setPreparing(false);
      setError('This recording could not be prepared for viewing.');
    };

    const tick = async () => {
      if (cancelled) return;
      let stage: string | undefined;
      try {
        const status = await apiClient.checkInferenceStatus(fileId);
        stage = status.data?.inference_status;
      } catch {
        // Best effort: the plot retry below is what actually decides.
      }
      if (cancelled) return;
      await fetchPlot({ force: true });
      // fetchPlot clears the ref synchronously once the file becomes viewable.
      if (cancelled || !preparingRef.current) return;
      if (stage === 'completed' || stage === 'failed' || Date.now() > deadline) {
        giveUp();
      }
    };

    const id = setInterval(tick, PREPARE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing, fileId, fetchPlot]);

  useEffect(() => {
    if (!fileId) return;
    // Assigned here rather than in its own effect so it is always up to date before the
    // fetch it gates is issued.
    currentKeyRef.current = buildCacheKey(plotStart, plotDuration, montage);
    fetchPlot();
  }, [fileId, montage, plotStart, plotDuration, fetchPlot, buildCacheKey]);

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

  const handleNextFocus = useCallback(() => {
    if (!focusPoints.length) return;
    const currentEnd = plotStart + plotDuration;
    let next = focusPoints.find((fp) => fp.center_s > currentEnd * 0.7);
    if (!next) next = focusPoints[0];
    goToStart(Math.max(0, next.center_s - plotDuration / 2));
  }, [focusPoints, plotStart, plotDuration, goToStart]);

  const handleFocusSelect = useCallback(
    (center_s: number) => {
      goToStart(Math.max(0, center_s - plotDuration / 2));
    },
    [plotDuration, goToStart]
  );

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

  // Prefetch both neighbours. Forward-only prefetching made every backwards step a cache
  // miss, so the Load button dropped into its loading state on each one while stepping
  // forwards never touched it.
  useEffect(() => {
    if (!fileId) return;
    [plotStart + plotDuration, plotStart - plotDuration].forEach((start) => {
      if (start < 0) return;
      if (totalDuration !== null && start >= totalDuration) return;
      const key = buildCacheKey(start, plotDuration, montage);
      if (plotCacheRef.current.has(key) || inflightRef.current.has(key)) return;
      fetchPlot({ startOverride: start, background: true });
    });
  }, [fileId, plotStart, plotDuration, montage, buildCacheKey, fetchPlot, totalDuration]);

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
      const offset = (N - idx - 1) * spacing;
      const src = ch.data || [];
      // One pass: scale, shift and track the global range together. Spreading a whole
      // channel array into Math.min/max is a RangeError waiting for a long enough window
      // — signals.py never downsamples, so window length is the only thing bounding it.
      const shifted = new Array<number>(src.length);
      for (let i = 0; i < src.length; i++) {
        const value = src[i] * sensitivityScale + offset;
        shifted[i] = value;
        if (value < globalMin) globalMin = value;
        if (value > globalMax) globalMax = value;
      }

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
            // 'normal wave' is green-on-green at double width over an identical base trace:
            // it carries no information and is the only reason line weight varies across the
            // recording. Channels the model never classifies (A1, A2, ECG) have no overlay at
            // all, so overprinting normals made them read as permanently thinner.
            if (etype !== 'spike wave' && etype !== 'slow wave') return;
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
                const color = etype === 'spike wave' ? 'red' : '#ffb300';
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

    focusPoints.forEach((fp) => {
      if (fp.center_s >= plotStart && fp.center_s <= plotStart + plotDuration) {
        traces.push({
          x: [fp.center_s, fp.center_s],
          y: [globalMin, globalMax],
          type: 'scatter',
          mode: 'lines',
          line: { color: 'rgba(255, 87, 34, 0.45)', width: 1.5, dash: 'dash' },
          showlegend: false,
          hoverinfo: 'text',
          hovertext: `Focus: ${fp.abnormal_pct}% abnormal`,
        });
      }
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
  // focusPoints only annotates traces that are already built here; adding it
  // would rebuild every trace whenever the focus changes — the expensive path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotData, eventsData, plotStart, plotDuration, montage, sensitivity]);

  return (
    <Card ref={containerRef} sx={{ mb: 3, bgcolor: isFullscreen ? '#fff' : undefined }}>
      <CardContent sx={{ pb: 2 }}>
        <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 1 }}>
            EEG Plot
          </Typography>

          {montage === 'original' && hasEvents && (
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

          {focusPoints.length > 0 && (
            <>
              <Tooltip title="Skip to next focus point">
                <IconButton size="small" onClick={handleNextFocus}>
                  <SkipNextIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel shrink>Focus</InputLabel>
                <Select
                  value=""
                  label="Focus"
                  onChange={(e) => handleFocusSelect(Number(e.target.value))}
                  displayEmpty
                  inputProps={{ 'aria-label': 'Jump to focus point' }}
                >
                  <MenuItem value="" disabled>
                    Jump to focus point
                  </MenuItem>
                  {focusPoints.map((fp) => (
                    <MenuItem key={fp.center_s} value={fp.center_s}>
                      {fp.center_s}s ({fp.abnormal_pct}%)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
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
              loading={plotLoading}
              loadingPosition="center"
              sx={{ width: 76, height: 28 }}
            >
              Load
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

        {/* Suppressed while `preparing`, which already replaces the plot with its own wait
            message — the EDF is not even converted yet, so stacking both is just noise. */}
        {analysisStatus === 'running' && !preparing && (
          <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 1 }}>
            Analyzing with AI — spike and slow-wave highlights and focus points will appear here
            automatically when it finishes. The traces below are complete and can be reviewed now.
          </Alert>
        )}

        {analysisStatus === 'failed' && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            AI analysis did not complete, so this recording has no wave highlights or focus points.
            The traces themselves are unaffected.
          </Alert>
        )}

        {preparing && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              py: 10,
            }}
          >
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Preparing recording for viewing…
            </Typography>
          </Box>
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
                              src={apiClient.resolveAssetUrl(bookmark.image_url)}
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
