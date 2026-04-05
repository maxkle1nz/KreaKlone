import { useCallback, useEffect, useRef, useState } from "react";
import MusicTempo from "music-tempo";

/* ── Types ── */

export type MusicSection = {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  color: string;
  canvasState: SectionCanvasState | null;
  isProposed?: boolean;
};

export type SectionCanvasState = {
  prompt: string;
  negativePrompt: string;
  styleTags: string;
  roi: { x: number; y: number; w: number; h: number } | null;
  palette: string[] | null;
};

export type SyncMode = "free" | "beat-locked" | "section-locked";

export type BeatSubdivision = "bar" | "beat" | "eighth" | "sixteenth" | "triplet" | "custom";

export type SyncTriggerCallback = (opts: {
  beatMs: number;
  section: MusicSection | null;
  burstCount: number;
}) => void;

export type FrequencyBands = { bass: number; mid: number; treble: number };

export type MusicSyncHook = {
  /* Audio state */
  audioBuffer: AudioBuffer | null;
  audioFileName: string | null;
  audioError: string | null;
  isImporting: boolean;
  importAudio: (file: File) => Promise<void>;
  clearAudio: () => void;

  /* BPM */
  bpm: number;
  setBpm: (bpm: number) => void;
  bpmDetected: boolean;
  beatTimestampsMs: number[];

  /* Waveform */
  waveformSamples: number[];

  /* Sections */
  sections: MusicSection[];
  setSections: (s: MusicSection[]) => void;
  addSection: (startMs: number, endMs: number) => void;
  removeSection: (id: string) => void;
  updateSection: (id: string, patch: Partial<MusicSection>) => void;
  getSectionAtMs: (ms: number) => MusicSection | null;
  autoDetectSections: () => void;

  /* Playback */
  isPlaying: boolean;
  playheadMs: number;
  play: (fromMs?: number) => void;
  pause: () => void;
  seek: (ms: number) => void;

  /* Sync mode */
  syncMode: SyncMode;
  setSyncMode: (m: SyncMode) => void;
  subdivision: BeatSubdivision;
  setSubdivision: (s: BeatSubdivision) => void;
  beatsPerTrigger: number;
  setBeatsPerTrigger: (n: number) => void;
  customSubdivFactor: number;
  setCustomSubdivFactor: (f: number) => void;

  /* Scheduler */
  startSyncScheduler: (onTrigger: SyncTriggerCallback) => void;
  stopSyncScheduler: () => void;

  /* Waveform lane — beat positions in ms (for timeline overlay) */
  getBeatPositions: (subdivision: BeatSubdivision) => number[];

  /* Snap to grid */
  snapToGrid: boolean;
  setSnapToGrid: (v: boolean) => void;

  /* Export helper */
  getAudioFile: () => Uint8Array | null;
  audioDurationMs: number;

  /* Live frequency analysis */
  getFrequencyBands: () => FrequencyBands;
};

/* ── Section colors / labels ── */
const SECTION_COLORS = [
  "#6e55f7", "#22c55e", "#f59e0b", "#ef4444",
  "#06b6d4", "#a855f7", "#84cc16", "#f97316",
];
const DEFAULT_SECTION_LABELS = ["Intro", "Verse", "Chorus", "Bridge", "Outro", "Drop", "Build", "Hook"];

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Downsampled waveform (amplitude envelope) ── */
function buildWaveform(buffer: AudioBuffer, samples = 400): number[] {
  const ch = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(ch.length / samples));
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const v = Math.abs(ch[i * blockSize + j] ?? 0);
      if (v > max) max = v;
    }
    out.push(max);
  }
  return out;
}

/* ── BPM detection via BeatRoot autocorrelation (music-tempo) ── */
function detectBpm(buffer: AudioBuffer): number {
  try {
    const ch = buffer.getChannelData(0);
    const mt = new (MusicTempo as unknown as new (data: Float32Array, opts: { sampleRate: number }) => { tempo: number })(
      ch,
      { sampleRate: buffer.sampleRate }
    );
    const detected = Math.round(mt.tempo);
    if (detected >= 40 && detected <= 240) return detected;
    /* Half/double-time correction */
    if (detected < 40) return Math.min(240, detected * 2);
    if (detected > 240) return Math.max(40, Math.round(detected / 2));
    return 120;
  } catch {
    return 120;
  }
}

/* ── Auto section detection: RMS + spectral centroid, 500ms windows ── */
function autoDetectSectionsFromBuffer(
  buffer: AudioBuffer,
  bpm: number,
  durationMs: number
): MusicSection[] {
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const WINDOW_MS = 500;
  const windowSize = Math.floor((WINDOW_MS / 1000) * sr);
  const stepSize = windowSize;
  const totalFrames = Math.floor(ch.length / stepSize);

  if (totalFrames < 4) {
    return [{
      id: makeId(), label: "?", startMs: 0, endMs: durationMs,
      color: SECTION_COLORS[0], canvasState: null, isProposed: true,
    } as MusicSection];
  }

  /* Compute per-frame RMS and spectral centroid */
  const features: { ms: number; rms: number; centroid: number }[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const start = f * stepSize;
    let sumSq = 0;
    let sumAmp = 0;
    let sumWeighted = 0;
    const half = Math.floor(windowSize / 2);
    for (let j = 0; j < windowSize && start + j < ch.length; j++) {
      const v = ch[start + j];
      sumSq += v * v;
      /* Approximate spectral centroid via absolute high-freq change */
      if (j > 0) {
        const diff = Math.abs(v - ch[start + j - 1]);
        sumAmp += diff;
        sumWeighted += diff * (j / half);
      }
    }
    const rms = Math.sqrt(sumSq / windowSize);
    const centroid = sumAmp > 0 ? sumWeighted / sumAmp : 0;
    features.push({ ms: (start / sr) * 1000, rms, centroid });
  }

  /* Normalize */
  const maxRms = Math.max(...features.map((f) => f.rms), 0.001);
  const maxCentroid = Math.max(...features.map((f) => f.centroid), 0.001);
  const norm = features.map((f) => ({
    ms: f.ms,
    rms: f.rms / maxRms,
    centroid: f.centroid / maxCentroid,
  }));

  /* Rolling delta: combined change score */
  const SMOOTHING = 3;
  const deltas: number[] = [];
  for (let i = SMOOTHING; i < norm.length - SMOOTHING; i++) {
    let dRms = 0;
    let dCent = 0;
    for (let k = 1; k <= SMOOTHING; k++) {
      dRms += Math.abs(norm[i].rms - norm[i - k].rms);
      dCent += Math.abs(norm[i].centroid - norm[i - k].centroid);
    }
    deltas.push((dRms + dCent * 0.5) / SMOOTHING);
  }

  /* Local maxima as candidate boundaries (min distance: 4 bars) */
  const msPerBeat = bpm > 0 ? 60000 / bpm : 500;
  const minDistMs = msPerBeat * 4 * 4; /* 4 bars (4 beats each) */
  const threshold = Math.max(0.05, (Math.max(...deltas) * 0.35));

  const rawBoundaries: number[] = [0];
  for (let i = 1; i < deltas.length - 1; i++) {
    const ms = norm[i + SMOOTHING].ms;
    if (
      deltas[i] > threshold &&
      deltas[i] >= deltas[i - 1] &&
      deltas[i] >= deltas[i + 1] &&
      ms - rawBoundaries[rawBoundaries.length - 1] >= minDistMs
    ) {
      rawBoundaries.push(ms);
    }
  }
  rawBoundaries.push(durationMs);

  /* Snap each boundary to the nearest beat */
  const beatPositions = computeBeatTimestamps(bpm, durationMs);
  const snapBoundary = (ms: number): number => {
    if (ms === 0 || ms === durationMs || beatPositions.length === 0) return ms;
    let best = beatPositions[0];
    let bestDist = Math.abs(ms - best);
    for (const bp of beatPositions) {
      const d = Math.abs(ms - bp);
      if (d < bestDist) { bestDist = d; best = bp; }
      if (bp > ms + msPerBeat * 2) break;
    }
    return best;
  };

  let boundaries = rawBoundaries.map(snapBoundary);
  /* Deduplicate (snapping can create collisions) */
  boundaries = boundaries.filter((b, i) => i === 0 || b !== boundaries[i - 1]);
  if (boundaries[boundaries.length - 1] !== durationMs) boundaries.push(durationMs);

  /* Merge sections shorter than 4 bars */
  const minSectionMs = msPerBeat * 4 * 4;
  let merged = true;
  while (merged && boundaries.length > 3) {
    merged = false;
    for (let i = 1; i < boundaries.length - 1; i++) {
      if (boundaries[i] - boundaries[i - 1] < minSectionMs ||
          boundaries[i + 1] - boundaries[i] < minSectionMs) {
        boundaries.splice(i, 1);
        merged = true;
        break;
      }
    }
  }

  /* Limit to 8 sections max */
  while (boundaries.length > 9) {
    let minGap = Infinity;
    let removeIdx = 1;
    for (let i = 1; i < boundaries.length - 1; i++) {
      const gap = boundaries[i + 1] - boundaries[i - 1];
      if (gap < minGap) { minGap = gap; removeIdx = i; }
    }
    boundaries.splice(removeIdx, 1);
  }

  return boundaries.slice(0, -1).map((startMs, i) => ({
    id: makeId(),
    label: "?",
    startMs,
    endMs: boundaries[i + 1],
    color: SECTION_COLORS[i % SECTION_COLORS.length],
    canvasState: null,
    isProposed: true,
  }));
}

/* ── Legacy section detection (kept for internal use) ── */
function detectSections(buffer: AudioBuffer, durationMs: number): MusicSection[] {
  return autoDetectSectionsFromBuffer(buffer, 120, durationMs);
}

/* ── Beat timestamps ── */
function computeBeatTimestamps(bpm: number, durationMs: number): number[] {
  const msPerBeat = 60000 / bpm;
  const beats: number[] = [];
  for (let t = 0; t <= durationMs; t += msPerBeat) beats.push(t);
  return beats;
}

/* ── Subdivision timestamps ── */
function subdivisionTimestamps(
  beatMs: number[],
  sub: BeatSubdivision,
  customFactor = 1.0,
): number[] {
  if (beatMs.length < 2) return beatMs;
  const avgInterval = (beatMs[beatMs.length - 1] - beatMs[0]) / (beatMs.length - 1);
  const factor: Record<BeatSubdivision, number> = {
    bar: 4, beat: 1, eighth: 0.5, sixteenth: 0.25, triplet: 1 / 3,
    custom: Math.max(0.01, customFactor),
  };
  const step = avgInterval * factor[sub];
  const end = beatMs[beatMs.length - 1] + avgInterval;
  const times: number[] = [];
  for (let t = beatMs[0]; t <= end; t += step) times.push(t);
  return times;
}

/* ─────────────────────── Hook ─────────────────────── */

/* Look-ahead scheduler constants */
const LOOK_AHEAD_MS = 100; // schedule this far ahead
const SCHEDULER_TICK_MS = 25; // tick every 25ms

export function useMusicSync(): MusicSyncHook {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [bpmDetected, setBpmDetected] = useState(false);
  const [waveformSamples, setWaveformSamples] = useState<number[]>([]);
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [syncMode, setSyncMode] = useState<SyncMode>("free");
  const [subdivision, setSubdivision] = useState<BeatSubdivision>("beat");
  const [beatsPerTrigger, setBeatsPerTrigger] = useState(4);
  const [customSubdivFactor, setCustomSubdivFactor] = useState(0.75);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const fftDataRef = useRef<Uint8Array>(new Uint8Array(2048));
  const playStartCtxTimeRef = useRef(0);
  const playStartMsRef = useRef(0);
  const playheadRafRef = useRef<number>(0);
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rawFileRef = useRef<Uint8Array | null>(null);

  /* Refs for use inside scheduler callbacks without stale closures */
  const isPlayingRef = useRef(false);
  const bpmRef = useRef(120);
  const beatsPerTriggerRef = useRef(4);
  const audioDurationMsRef = useRef(0);
  const syncModeRef = useRef<SyncMode>("free");
  const sectionsRef = useRef<MusicSection[]>([]);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsPerTriggerRef.current = beatsPerTrigger; }, [beatsPerTrigger]);
  useEffect(() => { syncModeRef.current = syncMode; }, [syncMode]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  /* Scheduled triggers tracking */
  const nextBeatTriggerMsRef = useRef<number>(0);
  const lastSectionIdTriggeredRef = useRef<string | null>(null);

  /* ── AudioContext singleton ── */
  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  /* ── Current audio position in ms ── */
  const getCurrentAudioMs = useCallback((): number => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isPlayingRef.current) return playStartMsRef.current;
    return (ctx.currentTime - playStartCtxTimeRef.current) * 1000 + playStartMsRef.current;
  }, []);

  /* ── Import audio ── */
  const importAudio = useCallback(async (file: File) => {
    setIsImporting(true);
    setAudioError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      rawFileRef.current = new Uint8Array(arrayBuffer);
      const ctx = getAudioCtx();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      setAudioBuffer(decoded);
      setAudioFileName(file.name);

      const durationMs = decoded.duration * 1000;
      audioDurationMsRef.current = durationMs;

      setWaveformSamples(buildWaveform(decoded));

      const detectedBpm = detectBpm(decoded);
      setBpm(detectedBpm);
      bpmRef.current = detectedBpm;
      setBpmDetected(true);

      setSections(detectSections(decoded, durationMs));
      setPlayheadMs(0);
      playStartMsRef.current = 0;
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : "Failed to decode audio");
    } finally {
      setIsImporting(false);
    }
  }, []);

  const clearAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* ignore */ }
      sourceNodeRef.current = null;
    }
    setAudioBuffer(null);
    setAudioFileName(null);
    setAudioError(null);
    setBpmDetected(false);
    setWaveformSamples([]);
    setSections([]);
    setPlayheadMs(0);
    setIsPlaying(false);
    isPlayingRef.current = false;
    rawFileRef.current = null;
    audioDurationMsRef.current = 0;
  }, []);

  /* ── Playhead animation ── */
  const stopPlayheadAnim = useCallback(() => {
    if (playheadRafRef.current) {
      cancelAnimationFrame(playheadRafRef.current);
      playheadRafRef.current = 0;
    }
  }, []);

  const tickPlayhead = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const ms = (ctx.currentTime - playStartCtxTimeRef.current) * 1000 + playStartMsRef.current;
    setPlayheadMs(ms);
    playheadRafRef.current = requestAnimationFrame(tickPlayhead);
  }, []);

  /* ── Playback ── */
  const pause = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* ignore */ }
      sourceNodeRef.current = null;
    }
    /* Freeze playhead at current position */
    const ctx = audioCtxRef.current;
    if (ctx && isPlayingRef.current) {
      const frozenMs = (ctx.currentTime - playStartCtxTimeRef.current) * 1000 + playStartMsRef.current;
      playStartMsRef.current = frozenMs;
      setPlayheadMs(frozenMs);
    }
    stopPlayheadAnim();
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [stopPlayheadAnim]);

  const play = useCallback((fromMs = 0) => {
    const buf = audioBuffer;
    if (!buf) return;
    pause();
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    /* Insert AnalyserNode between source and destination for FFT */
    if (!analyserNodeRef.current || analyserNodeRef.current.context !== ctx) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserNodeRef.current = analyser;
      fftDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    src.connect(analyserNodeRef.current);
    analyserNodeRef.current.connect(ctx.destination);
    const startOffset = fromMs / 1000;
    playStartCtxTimeRef.current = ctx.currentTime;
    playStartMsRef.current = fromMs;
    src.start(0, startOffset);
    src.onended = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopPlayheadAnim();
    };
    sourceNodeRef.current = src;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setPlayheadMs(fromMs);
    playheadRafRef.current = requestAnimationFrame(tickPlayhead);
  }, [audioBuffer, pause, stopPlayheadAnim, tickPlayhead]);

  const seek = useCallback((ms: number) => {
    const clampedMs = Math.max(0, ms);
    playStartMsRef.current = clampedMs;
    setPlayheadMs(clampedMs);
    if (isPlayingRef.current) play(clampedMs);
  }, [play]);

  /* ── Computed values ── */
  const audioDurationMs = audioBuffer ? audioBuffer.duration * 1000 : 0;

  const beatTimestampsMs = audioBuffer
    ? computeBeatTimestamps(bpm, audioBuffer.duration * 1000)
    : [];

  /* ── Section management ── */
  const addSection = useCallback((startMs: number, endMs: number) => {
    setSections((prev) => {
      const colorIdx = prev.length % SECTION_COLORS.length;
      const labelIdx = prev.length % DEFAULT_SECTION_LABELS.length;
      return [...prev, {
        id: makeId(),
        label: DEFAULT_SECTION_LABELS[labelIdx],
        startMs,
        endMs,
        color: SECTION_COLORS[colorIdx],
        canvasState: null,
      }];
    });
  }, []);

  const removeSection = useCallback((id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSection = useCallback((id: string, patch: Partial<MusicSection>) => {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const getSectionAtMs = useCallback((ms: number): MusicSection | null => {
    return sectionsRef.current.find((s) => ms >= s.startMs && ms < s.endMs) ?? null;
  }, []);

  /* ── Look-ahead beat scheduler ── */
  const stopSyncScheduler = useCallback(() => {
    if (schedulerTimerRef.current !== null) {
      clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    nextBeatTriggerMsRef.current = 0;
    lastSectionIdTriggeredRef.current = null;
  }, []);

  const startSyncScheduler = useCallback((onTrigger: SyncTriggerCallback) => {
    stopSyncScheduler();

    /* Quantize to next beat-grid boundary >= current playhead */
    const startMs = playStartMsRef.current;
    const msPerBeat = 60000 / bpmRef.current;
    const beatIntervalMsInit = msPerBeat * beatsPerTriggerRef.current;
    const groupsElapsed = Math.ceil(startMs / beatIntervalMsInit);
    nextBeatTriggerMsRef.current = groupsElapsed * beatIntervalMsInit;
    lastSectionIdTriggeredRef.current = null;

    const tick = () => {
      if (!isPlayingRef.current) return;

      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const currentAudioMs = (ctx.currentTime - playStartCtxTimeRef.current) * 1000 + playStartMsRef.current;
      const mode = syncModeRef.current;

      if (mode === "beat-locked") {
        const msPerBeat = 60000 / bpmRef.current;
        const beatIntervalMs = msPerBeat * beatsPerTriggerRef.current;

        /* Schedule all beat triggers within look-ahead window */
        while (nextBeatTriggerMsRef.current <= currentAudioMs + LOOK_AHEAD_MS) {
          const triggerMs = nextBeatTriggerMsRef.current;
          const delay = Math.max(0, triggerMs - currentAudioMs);
          const sectionAtTrigger = sectionsRef.current.find(
            (s) => triggerMs >= s.startMs && triggerMs < s.endMs
          ) ?? null;

          setTimeout(() => {
            if (!isPlayingRef.current) return;
            onTrigger({ beatMs: triggerMs, section: sectionAtTrigger, burstCount: 1 });
          }, delay);

          nextBeatTriggerMsRef.current += beatIntervalMs;

          if (nextBeatTriggerMsRef.current > audioDurationMsRef.current) break;
        }
      } else if (mode === "section-locked") {
        /* Fire once per section when playhead enters it */
        const currentSection = sectionsRef.current.find(
          (s) => currentAudioMs >= s.startMs && currentAudioMs < s.endMs
        ) ?? null;

        if (currentSection && currentSection.id !== lastSectionIdTriggeredRef.current) {
          lastSectionIdTriggeredRef.current = currentSection.id;
          /* Derive burst count from section duration and beat grid */
          const msPerBeat = 60000 / bpmRef.current;
          const beatInterval = msPerBeat * beatsPerTriggerRef.current;
          const sectionDurationMs = currentSection.endMs - currentSection.startMs;
          const derivedBurst = Math.max(1, Math.round(sectionDurationMs / beatInterval));
          onTrigger({ beatMs: currentAudioMs, section: currentSection, burstCount: derivedBurst });
        }
      }
    };

    schedulerTimerRef.current = setInterval(tick, SCHEDULER_TICK_MS);
  }, [stopSyncScheduler]);

  /* ── getBeatPositions ── */
  const getBeatPositions = useCallback((sub: BeatSubdivision): number[] => {
    return subdivisionTimestamps(beatTimestampsMs, sub, customSubdivFactor);
  }, [beatTimestampsMs, customSubdivFactor]);

  /* ── getAudioFile ── */
  const getAudioFile = useCallback((): Uint8Array | null => {
    return rawFileRef.current;
  }, []);

  /* ── autoDetectSections ── */
  const autoDetectSections = useCallback(() => {
    const buf = audioBuffer;
    if (!buf) return;
    const durationMs = buf.duration * 1000;
    const detected = autoDetectSectionsFromBuffer(buf, bpmRef.current, durationMs);
    setSections(detected);
  }, [audioBuffer]);

  /* ── getFrequencyBands: normalized 0–1 bass/mid/treble from live AnalyserNode ── */
  const getFrequencyBands = useCallback((): FrequencyBands => {
    const analyser = analyserNodeRef.current;
    if (!analyser) return { bass: 0, mid: 0, treble: 0 };
    const data = new Uint8Array(fftDataRef.current.buffer, fftDataRef.current.byteOffset, fftDataRef.current.byteLength);
    analyser.getByteFrequencyData(data as unknown as Uint8Array<ArrayBuffer>);
    const len = data.length;
    /* Bin ranges: bass 0–4, mid 5–20, treble 21–60 */
    const avg = (lo: number, hi: number) => {
      hi = Math.min(hi, len - 1);
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += data[i];
      return sum / ((hi - lo + 1) * 255);
    };
    return {
      bass: avg(0, 4),
      mid: avg(5, 20),
      treble: avg(21, 60),
    };
  }, []);

  /* ── Update audioDurationMsRef when buffer changes ── */
  useEffect(() => {
    audioDurationMsRef.current = audioBuffer ? audioBuffer.duration * 1000 : 0;
  }, [audioBuffer]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      stopPlayheadAnim();
      stopSyncScheduler();
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, [stopPlayheadAnim, stopSyncScheduler]);

  return {
    audioBuffer, audioFileName, audioError, isImporting, importAudio, clearAudio,
    bpm, setBpm, bpmDetected, beatTimestampsMs,
    waveformSamples,
    sections, setSections, addSection, removeSection, updateSection, getSectionAtMs,
    autoDetectSections,
    isPlaying, playheadMs, play, pause, seek,
    syncMode, setSyncMode, subdivision, setSubdivision,
    beatsPerTrigger, setBeatsPerTrigger,
    customSubdivFactor, setCustomSubdivFactor,
    startSyncScheduler, stopSyncScheduler,
    getBeatPositions, getAudioFile,
    audioDurationMs,
    snapToGrid, setSnapToGrid,
    getFrequencyBands,
  };
}
