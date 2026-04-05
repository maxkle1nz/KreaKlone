import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import type { TimelineFrame, SessionAsset, SessionState } from "@/hooks/useYlimitSession";
import type { MusicSyncHook, MusicSection } from "@/hooks/useMusicSync";

/* ── Export opts passed to onExport ── */
export type ExportOpts = {
  effectiveFrames: TimelineFrame[];
  trimInMs: number;
  trimOutMs: number;
};

/* ── Types ── */
type Props = {
  sessionId: string | null;
  sessionState: SessionState | null;
  isGenerating: boolean;
  music: MusicSyncHook;
  sendTimelineSeek: (frameId: string) => void;
  sendTimelinePlay: () => void;
  sendTimelinePause: () => void;
  sendLoopSet: (startId: string, endId: string) => void;
  sendLoopClear: () => void;
  pinFrame: (frameId: string) => void;
  deleteFrame: (frameId: string) => void;
  sendRecordStart: (source?: "output" | "full-session") => void;
  sendRecordStop: () => void;
  latestRecordingAsset: SessionAsset | null;
  onExport: (opts: ExportOpts) => void;
  exportProgress: number | null;
  frameTagMap: Map<string, string>;
  onFrameToCanvas?: (uri: string) => void;
  onFrameToReference?: (assetId: string, uri: string) => void;
  onFrameRefine?: (frameId: string) => void;
  playFps?: number;
  setPlayFps?: (fps: number) => void;
};

/* ── Shortcuts overlay ── */
const SHORTCUT_ROWS: [string, string][] = [
  ["Space", "Play / pause"],
  ["G", "Generate now (bypass debounce)"],
  ["← →", "Previous / next frame"],
  ["K", "Pin / unpin hovered frame"],
  ["D / Backspace", "Delete hovered frame"],
  ["1 – 5", "Rate hovered frame"],
  ["[", "Set loop start at hovered frame"],
  ["]", "Set loop end at hovered frame"],
  ["Shift+click", "Set loop range (click start, then end)"],
  ["?", "Toggle this overlay"],
  ["Esc", "Close overlay / context menu"],
  /* Mouse / drag interactions */
  ["Drag frame body", "Reposition frame in time (saved per session)"],
  ["Drag right-edge handle", "Trim: extend/shorten hold duration to next frame"],
  ["Drag waveform In/Out marker", "Set audio export trim range"],
  ["Drag section body", "Move section start/end together in time"],
];

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="yl-shortcuts-overlay" onClick={onClose}>
      <div className="yl-shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="yl-shortcuts-header">
          <span>Keyboard shortcuts</span>
          <button className="yl-shortcuts-close" onClick={onClose}>×</button>
        </div>
        <table className="yl-shortcuts-table">
          <tbody>
            {SHORTCUT_ROWS.map(([key, desc]) => (
              <tr key={key}>
                <td className="yl-shortcut-key">{key}</td>
                <td className="yl-shortcut-desc">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Rating storage ── */
function useRatings(sessionId: string | null) {
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || loadedRef.current === sessionId) return;
    loadedRef.current = sessionId;
    try {
      const raw = localStorage.getItem(`ylimit_ratings_${sessionId}`);
      if (raw) setRatings(new Map(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [sessionId]);
  const setRating = useCallback((frameId: string, stars: number) => {
    setRatings((prev) => {
      const next = new Map(prev);
      stars > 0 ? next.set(frameId, stars) : next.delete(frameId);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    try { localStorage.setItem(`ylimit_ratings_${sessionId}`, JSON.stringify([...ratings])); } catch { /* ignore */ }
  }, [ratings, sessionId]);
  return { ratings, setRating };
}

/* ── Frame position overrides (localStorage) ── */
function useFramePositions(sessionId: string | null) {
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || loadedRef.current === sessionId) return;
    loadedRef.current = sessionId;
    /* Always reset first so stale in-memory state from prior session is cleared */
    setOverrides(new Map());
    try {
      const raw = localStorage.getItem(`ylimit_framepos_${sessionId}`);
      if (raw) setOverrides(new Map(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [sessionId]);
  const setOverride = useCallback((frameId: string, ms: number) => {
    setOverrides((prev) => { const next = new Map(prev); next.set(frameId, ms); return next; });
  }, []);
  useEffect(() => {
    if (!sessionId) return;
    try { localStorage.setItem(`ylimit_framepos_${sessionId}`, JSON.stringify([...overrides])); } catch { /* ignore */ }
  }, [overrides, sessionId]);
  return { overrides, setOverride };
}

/* ── Audio trim state (localStorage) ── */
function useAudioTrim(sessionId: string | null, durationMs: number) {
  const [trimInMs, setTrimInMs] = useState(0);
  const [trimOutMs, setTrimOutMs] = useState(0);
  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || loadedRef.current === sessionId) return;
    loadedRef.current = sessionId;
    /* Always reset to defaults first so prior session state doesn't leak */
    setTrimInMs(0);
    setTrimOutMs(durationMs > 0 ? durationMs : 0);
    try {
      const raw = localStorage.getItem(`ylimit_audiotrim_${sessionId}`);
      if (raw) {
        const { inMs, outMs } = JSON.parse(raw);
        if (typeof inMs === "number") setTrimInMs(inMs);
        if (typeof outMs === "number") setTrimOutMs(outMs);
      }
    } catch { /* ignore */ }
  }, [sessionId]);
  /* Clamp both values whenever audio duration changes (covers stale localStorage after audio swap) */
  useEffect(() => {
    if (durationMs <= 0) return;
    setTrimInMs((prev) => Math.max(0, Math.min(prev, durationMs - 1)));
    setTrimOutMs((prev) => {
      if (prev <= 0) return durationMs; /* initial load or unset */
      const clamped = Math.min(prev, durationMs);
      return clamped;
    });
  }, [durationMs]);
  useEffect(() => {
    if (!sessionId) return;
    try { localStorage.setItem(`ylimit_audiotrim_${sessionId}`, JSON.stringify({ inMs: trimInMs, outMs: trimOutMs })); } catch { /* ignore */ }
  }, [trimInMs, trimOutMs, sessionId]);
  return { trimInMs, trimOutMs, setTrimInMs, setTrimOutMs };
}

/* ── Format helpers ── */
function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/* ── Constants ── */
const WAVEFORM_H = 56;
const SECTION_H = 18;
const FRAME_H = 60;
const FRAME_W = 80;   /* fallback / minimum display width */
const MIN_FRAME_W = 40;
const RULER_H = 14;
const TIMELINE_H = SECTION_H + WAVEFORM_H + FRAME_H + RULER_H;
const HIT = 14;
const DRAG_THRESHOLD = 5;
const MIN_GAP_MS = 200; /* minimum ms gap enforced between adjacent frames */

/* ── Section editor ── */
function SectionEditor({
  section,
  onUpdate,
  onRemove,
  onClose,
}: {
  section: MusicSection;
  onUpdate: (patch: Partial<MusicSection>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const cs = section.canvasState ?? { prompt: "", negativePrompt: "", styleTags: "", roi: null, palette: null };
  const [prompt, setPrompt] = useState(cs.prompt);
  const [neg, setNeg] = useState(cs.negativePrompt);
  const [tags, setTags] = useState(cs.styleTags);
  const [label, setLabel] = useState(section.label);

  const commit = () => {
    const patch: Partial<MusicSection> = {
      label: label.trim() || "?",
      isProposed: false,
      canvasState: { ...cs, prompt, negativePrompt: neg, styleTags: tags },
    };
    onUpdate(patch);
    onClose();
  };

  return (
    <div className="yl-ut-section-editor" style={{ borderLeftColor: section.color }}>
      <div className="yl-ut-se-header">
        <input
          className="yl-ut-se-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Section name"
        />
        <span className="yl-ut-se-time">{fmtMs(section.startMs)} – {fmtMs(section.endMs)}</span>
        <button className="yl-ut-se-remove" onClick={onRemove} title="Delete section">×</button>
        <button className="yl-ut-se-close" onClick={onClose}>↓</button>
      </div>
      <div className="yl-ut-se-row">
        <textarea
          className="yl-ut-se-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt for this section…"
          rows={2}
        />
        <textarea
          className="yl-ut-se-input"
          value={neg}
          onChange={(e) => setNeg(e.target.value)}
          placeholder="Negative prompt…"
          rows={2}
        />
        <input
          className="yl-ut-se-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Style tags (e.g. cinematic, neon)"
        />
        <button className="yl-ut-se-save" onClick={commit}>Save</button>
      </div>
    </div>
  );
}

/* ── Main component ── */
export function UnifiedTimeline({
  sessionId, sessionState, isGenerating,
  music, sendTimelineSeek, sendTimelinePlay, sendTimelinePause,
  sendLoopSet, sendLoopClear, pinFrame, deleteFrame, sendRecordStart, sendRecordStop, latestRecordingAsset, onExport, exportProgress, frameTagMap,
  onFrameToCanvas, onFrameToReference, onFrameRefine,
  playFps: playFpsProp, setPlayFps: setPlayFpsProp,
}: Props) {
  const frames: TimelineFrame[] = sessionState?.timelineFrames ?? [];
  const activeFrameId = sessionState?.activeFrameId;
  const { ratings, setRating } = useRatings(sessionId);
  const { overrides: posOverrides, setOverride: setPosOverride } = useFramePositions(sessionId);

  /* ── Timeline scroll container ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playFpsInternal, setPlayFpsInternal] = useState(12);
  const playFps = playFpsProp ?? playFpsInternal;
  const setPlayFps = setPlayFpsProp ?? setPlayFpsInternal;
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playIdxRef = useRef(0);

  /* ── Refs to keep interval callbacks current without stale closures ── */
  const framesRef = useRef<TimelineFrame[]>([]);
  const loopStartIdxRef = useRef(-1);
  const loopEndIdxRef = useRef(-1);
  const effectiveFramesRef = useRef<TimelineFrame[]>([]);
  const sendTimelineSeekRef = useRef(sendTimelineSeek);

  /* ── Active frame index ── */
  const activeIndex = frames.findIndex((f) => f.frameId === activeFrameId);

  /* ── BPM edit ── */
  const [bpmInput, setBpmInput] = useState(String(music.bpm));
  useEffect(() => { setBpmInput(String(music.bpm)); }, [music.bpm]);

  /* ── Selected section for inline editor ── */
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const editingSection = music.sections.find((s) => s.id === editingSectionId) ?? null;

  /* ── Drop zone ── */
  const [dragOver, setDragOver] = useState(false);

  /* ── Hover tracking ── */
  const hoveredIdxRef = useRef(-1);

  /* ── Loop range ── */
  const loopRange = sessionState?.loopRange;
  /* loopStartIdx / loopEndIdx computed from effectiveFrames below (after sorting) */

  /* ── Keep refs current (avoids stale closures inside setInterval) ── */
  framesRef.current = frames;
  sendTimelineSeekRef.current = sendTimelineSeek;

  /* ── Pinned ── */
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [recordMode, setRecordMode] = useState<"idle" | "recording">("idle");

  useEffect(() => {
    setPinnedIds(new Set(frames.filter((frame) => frame.isPinned).map((frame) => frame.frameId)));
  }, [frames]);

  /* ── Timeline geometry ── */
  const hasAudio = !!music.audioBuffer;
  const durationMs = music.audioDurationMs || 1;
  const waveform = music.waveformSamples;
  const beats = music.getBeatPositions("beat");
  const sections = music.sections;

  /* ── Audio trim ── */
  const { trimInMs, trimOutMs, setTrimInMs, setTrimOutMs } = useAudioTrim(sessionId, music.audioDurationMs);

  const totalTimelineMs = useMemo(() => {
    if (hasAudio) return durationMs;
    if (frames.length === 0) return 1;
    const last = frames[frames.length - 1];
    if (last.createdAt) {
      const first = frames[0];
      if (first.createdAt) {
        return Math.max(1, new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime() + 1000);
      }
    }
    return frames.length * 1000;
  }, [hasAudio, durationMs, frames]);

  /* Width of full timeline in px: at least fill viewport */
  const TIMELINE_MIN_W = 900;
  const [viewW, setViewW] = useState(TIMELINE_MIN_W);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setViewW(el.clientWidth));
    obs.observe(el);
    setViewW(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  const ZOOM_BASE = Math.max(TIMELINE_MIN_W, viewW);
  const [zoom, setZoom] = useState(1);
  const timelineW = ZOOM_BASE * zoom;
  const msToX = useCallback((ms: number) => (ms / totalTimelineMs) * timelineW, [totalTimelineMs, timelineW]);
  const xToMs = useCallback((x: number) => Math.max(0, Math.min(totalTimelineMs, (x / timelineW) * totalTimelineMs)), [totalTimelineMs, timelineW]);

  /* ── Effective frames: apply position overrides, then sort by audioPositionMs when audio loaded ── */
  const effectiveFrames = useMemo((): TimelineFrame[] => {
    const mapped = frames.map((f, origIdx) => {
      const override = posOverrides.get(f.frameId);
      return { frame: override != null ? { ...f, audioPositionMs: override } : f, origIdx };
    });
    if (!hasAudio) return mapped.map(({ frame }) => frame);
    /* Sort ascending by effective audioPositionMs for correct layout, playback, and export */
    mapped.sort((a, b) => {
      const aMs = a.frame.audioPositionMs ?? ((a.origIdx / Math.max(1, frames.length - 1)) * durationMs);
      const bMs = b.frame.audioPositionMs ?? ((b.origIdx / Math.max(1, frames.length - 1)) * durationMs);
      return aMs - bMs;
    });
    return mapped.map(({ frame }) => frame);
  }, [frames, posOverrides, hasAudio, durationMs]);

  /* ── Per-frame widths (proportional to gap between consecutive positions) ── */
  const frameWidths = useMemo((): number[] => {
    if (effectiveFrames.length === 0) return [];
    if (!hasAudio) {
      const gap = timelineW / Math.max(1, effectiveFrames.length);
      return effectiveFrames.map(() => Math.max(MIN_FRAME_W, gap));
    }
    return effectiveFrames.map((f, i) => {
      const nextF = effectiveFrames[i + 1];
      const posMs = f.audioPositionMs ?? ((i / Math.max(1, effectiveFrames.length - 1)) * durationMs);
      const nextMs = nextF
        ? (nextF.audioPositionMs ?? (((i + 1) / Math.max(1, effectiveFrames.length - 1)) * durationMs))
        : durationMs;
      return Math.max(MIN_FRAME_W, msToX(nextMs) - msToX(posMs));
    });
  }, [effectiveFrames, hasAudio, durationMs, msToX, timelineW]);

  /* ── Sync effectiveFrames ref (for play-interval callback) ── */
  effectiveFramesRef.current = effectiveFrames;

  /* ── Active index within sorted effectiveFrames ── */
  const activeIndexEffective = effectiveFrames.findIndex((f) => f.frameId === activeFrameId);

  /* ── Loop range indices — derived from effectiveFrames (sorted) ── */
  const loopStartIdx = loopRange ? effectiveFrames.findIndex((f) => f.frameId === loopRange.startFrameId) : -1;
  const loopEndIdx = loopRange ? effectiveFrames.findIndex((f) => f.frameId === loopRange.endFrameId) : -1;
  loopStartIdxRef.current = loopStartIdx;
  loopEndIdxRef.current = loopEndIdx;

  /* ── Overlapping frames: those whose width is at minimum clamp (visually compressed) ── */
  const overlappingIds = useMemo((): Set<string> => {
    if (!hasAudio || effectiveFrames.length < 2) return new Set();
    const s = new Set<string>();
    for (let i = 0; i < effectiveFrames.length - 1; i++) {
      const aMs = effectiveFrames[i].audioPositionMs ?? 0;
      const bMs = effectiveFrames[i + 1].audioPositionMs ?? 0;
      if (bMs - aMs < MIN_GAP_MS * 1.5) {
        s.add(effectiveFrames[i].frameId);
        s.add(effectiveFrames[i + 1].frameId);
      }
    }
    return s;
  }, [effectiveFrames, hasAudio]);

  /* Frame X positions — left-aligned at beat/time position */
  const frameX = useCallback((idx: number): number => {
    const f = effectiveFrames[idx];
    if (!f) return -999;
    if (hasAudio) {
      if (f.audioPositionMs != null) return msToX(f.audioPositionMs);
      if (f.createdAt && effectiveFrames[0]?.createdAt) {
        const firstMs = new Date(effectiveFrames[0].createdAt).getTime();
        const ms = new Date(f.createdAt).getTime() - firstMs;
        return msToX(ms);
      }
    }
    const gap = timelineW / Math.max(1, effectiveFrames.length);
    return gap * idx;
  }, [effectiveFrames, hasAudio, msToX, timelineW]);

  /* ── Music play/pause ── */
  const musicPlayPause = useCallback(() => {
    if (music.isPlaying) music.pause();
    else music.play(music.playheadMs);
  }, [music]);

  /* ── Playback (frame strip) ── */
  const playPauseFrames = useCallback(() => {
    if (hasAudio) {
      musicPlayPause();
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
      clearInterval(playTimerRef.current!);
      sendTimelinePause();
    } else {
      if (effectiveFramesRef.current.length === 0) return;
      setIsPlaying(true);
      sendTimelinePlay();
      playIdxRef.current = activeIndex >= 0 ? activeIndex : 0;
      playTimerRef.current = setInterval(() => {
        /* use effectiveFramesRef so we walk frames in their sorted time order */
        const cur = effectiveFramesRef.current;
        if (cur.length === 0) return;
        const loStart = loopStartIdxRef.current;
        const loEnd = loopEndIdxRef.current;
        const hasLoop = loStart >= 0 && loEnd > loStart;
        let next = playIdxRef.current + 1;
        if (hasLoop) {
          if (next > loEnd) next = loStart;
        } else {
          next = next % cur.length;
        }
        playIdxRef.current = next;
        sendTimelineSeekRef.current(cur[next].frameId);
      }, 1000 / playFps);
    }
  }, [hasAudio, isPlaying, activeIndex, sendTimelinePlay, sendTimelinePause, playFps, musicPlayPause]);

  useEffect(() => {
    if (hasAudio && isPlaying) {
      setIsPlaying(false);
      clearInterval(playTimerRef.current!);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAudio]);

  useEffect(() => () => { clearInterval(playTimerRef.current!); }, []);

  /* ── Music-driven frame selection ── */
  const lastMusicFrameIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasAudio || !music.isPlaying || effectiveFrames.length === 0) return;
    /* Find frame whose playback range contains the current playhead */
    let bestIdx = effectiveFrames.length - 1;
    for (let i = 0; i < effectiveFrames.length - 1; i++) {
      const fMs = effectiveFrames[i].audioPositionMs ?? ((i / Math.max(1, effectiveFrames.length - 1)) * durationMs);
      const nextMs = effectiveFrames[i + 1].audioPositionMs ?? (((i + 1) / Math.max(1, effectiveFrames.length - 1)) * durationMs);
      if (music.playheadMs >= fMs && music.playheadMs < nextMs) {
        bestIdx = i;
        break;
      }
    }
    /* Fallback: nearest by distance */
    if (bestIdx === effectiveFrames.length - 1) {
      let bestDist = Infinity;
      effectiveFrames.forEach((f, i) => {
        const fMs = f.audioPositionMs ?? ((i / Math.max(1, effectiveFrames.length - 1)) * durationMs);
        const dist = Math.abs(fMs - music.playheadMs);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
    }
    const bestId = effectiveFrames[bestIdx]?.frameId;
    if (bestId && bestId !== lastMusicFrameIdRef.current) {
      lastMusicFrameIdRef.current = bestId;
      sendTimelineSeek(bestId);
    }
  }, [music.playheadMs, hasAudio, music.isPlaying, effectiveFrames, durationMs, sendTimelineSeek]);

  /* ── Seek on timeline click ── */
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    const ms = xToMs(x);
    if (hasAudio) music.seek(ms);
    /* Find nearest frame by center of its block */
    let best = -1, bestD = Infinity;
    effectiveFrames.forEach((_, i) => {
      const fw = frameWidths[i] ?? FRAME_W;
      const center = frameX(i) + fw / 2;
      const d = Math.abs(x - center);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0 && bestD < (frameWidths[best] ?? FRAME_W)) sendTimelineSeek(effectiveFrames[best].frameId);
  }, [xToMs, hasAudio, music, effectiveFrames, frameWidths, frameX, sendTimelineSeek]);

  /* ── Section boundary drag ── */
  const sectionDragRef = useRef<{ id: string; side: "start" | "end" } | null>(null);

  /* ── Section body move drag ── */
  const sectionBodyDragRef = useRef<{
    id: string; startClientX: number; startMs: number; startEnd: number; didMove: boolean;
  } | null>(null);
  /* Separate ref that outlives the drag ref so onClick can check it after pointerUp nulled the drag */
  const sectionDidMoveRef = useRef(false);

  /* ── Audio trim marker drag ── */
  const trimDragRef = useRef<"in" | "out" | null>(null);

  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGRectElement>, sectionId: string, side: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    sectionDragRef.current = { id: sectionId, side };
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, []);

  const handleSectionBodyDown = useCallback((e: React.PointerEvent<SVGRectElement>, sectionId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sec = music.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    sectionDidMoveRef.current = false; /* reset persistent flag each new pointer sequence */
    sectionBodyDragRef.current = { id: sectionId, startClientX: e.clientX, startMs: sec.startMs, startEnd: sec.endMs, didMove: false };
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, [music.sections]);

  const handleTrimPointerDown = useCallback((e: React.PointerEvent<SVGElement>, side: "in" | "out") => {
    e.stopPropagation();
    e.preventDefault();
    trimDragRef.current = side;
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }, []);

  const handleSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    const ms = xToMs(x);

    /* Section boundary resize */
    if (sectionDragRef.current) {
      const { id, side } = sectionDragRef.current;
      const sec = music.sections.find((s) => s.id === id);
      if (sec) {
        if (side === "start") music.updateSection(id, { startMs: Math.max(0, Math.min(sec.endMs - 1000, ms)) });
        else music.updateSection(id, { endMs: Math.min(durationMs, Math.max(sec.startMs + 1000, ms)) });
      }
      return;
    }

    /* Section body move — clamped to adjacent section boundaries */
    if (sectionBodyDragRef.current) {
      const body = sectionBodyDragRef.current;
      const dx = e.clientX - body.startClientX;
      if (!body.didMove && Math.abs(dx) > DRAG_THRESHOLD) body.didMove = true;
      if (body.didMove) {
        sectionDidMoveRef.current = true; /* mirror in persistent ref (survives pointerUp null) */
        const deltaMs = (dx / timelineW) * totalTimelineMs;
        const duration = body.startEnd - body.startMs;
        const sorted = [...music.sections].sort((a, b) => a.startMs - b.startMs);
        const secIdx = sorted.findIndex((s) => s.id === body.id);
        const prevSec = sorted[secIdx - 1];
        const nextSec = sorted[secIdx + 1];
        const minStart = prevSec ? prevSec.endMs : 0;
        const maxStart = nextSec ? nextSec.startMs - duration : durationMs - duration;
        const newStart = Math.max(minStart, Math.min(Math.max(0, maxStart), body.startMs + deltaMs));
        music.updateSection(body.id, { startMs: newStart, endMs: newStart + duration });
      }
      return;
    }

    /* Trim marker drag */
    if (trimDragRef.current) {
      if (trimDragRef.current === "in") {
        setTrimInMs(Math.max(0, Math.min(trimOutMs - 500, ms)));
      } else {
        setTrimOutMs(Math.max(trimInMs + 500, Math.min(durationMs, ms)));
      }
    }
  }, [xToMs, music, durationMs, timelineW, totalTimelineMs, trimInMs, trimOutMs, setTrimInMs, setTrimOutMs]);

  const handleSvgPointerUp = useCallback(() => {
    sectionDragRef.current = null;
    trimDragRef.current = null;
    /* Section body: release, didMove flag controls whether onClick fires */
    if (sectionBodyDragRef.current) {
      sectionBodyDragRef.current = null;
    }
  }, []);

  /* ── Frame reposition drag ── */
  const framePendingDragRef = useRef<{
    frameId: string; idx: number; startClientX: number; startMs: number; msPerPx: number;
  } | null>(null);
  const frameDragActiveRef = useRef(false);
  const [frameDragGhostId, setFrameDragGhostId] = useState<string | null>(null);
  const ghostDivRef = useRef<HTMLDivElement | null>(null);

  const handleFramePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, idx: number) => {
    if (e.button !== 0 || e.shiftKey) return;
    const f = effectiveFrames[idx];
    if (!f) return;
    framePendingDragRef.current = {
      frameId: f.frameId,
      idx,
      startClientX: e.clientX,
      startMs: f.audioPositionMs ?? 0,
      msPerPx: timelineW > 0 ? totalTimelineMs / timelineW : 0,
    };
    frameDragActiveRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [effectiveFrames, totalTimelineMs, timelineW]);

  const handleFramePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const pending = framePendingDragRef.current;
    if (!pending) return;
    const dx = e.clientX - pending.startClientX;
    if (!frameDragActiveRef.current && Math.abs(dx) > DRAG_THRESHOLD) {
      frameDragActiveRef.current = true;
      setFrameDragGhostId(pending.frameId);
    }
    if (!frameDragActiveRef.current) return;
    /* Update ghost position via direct DOM (no re-render) */
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const timelineX = e.clientX - rect.left + el.scrollLeft;
    if (ghostDivRef.current) {
      ghostDivRef.current.style.left = `${timelineX}px`;
    }
  }, []);

  /* Beat snapping: respects the `music.snapToGrid` toggle (intentional — users can disable snapping) */
  const snapToBeats = useCallback((ms: number): number => {
    if (!hasAudio || !music.snapToGrid) return ms;
    const beatPositions = music.getBeatPositions("beat");
    let best = ms, bestDist = Infinity;
    for (const b of beatPositions) {
      const d = Math.abs(b - ms);
      if (d < bestDist) { bestDist = d; best = b; }
      if (b > ms + 2000) break;
    }
    return best;
  }, [hasAudio, music]);

  const handleFramePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const pending = framePendingDragRef.current;
    if (!pending) return;
    if (frameDragActiveRef.current) {
      /* Delta-based commit: startMs + (pointerDelta * msPerPx), then snap + clamp */
      const deltaMs = (e.clientX - pending.startClientX) * pending.msPerPx;
      const candidateMs = pending.startMs + deltaMs;
      const newMs = snapToBeats(Math.max(0, Math.min(durationMs, candidateMs)));
      setPosOverride(pending.frameId, newMs);
      isDraggingFrameRef.current = true;
      setTimeout(() => { isDraggingFrameRef.current = false; }, 80);
    }
    framePendingDragRef.current = null;
    frameDragActiveRef.current = false;
    setFrameDragGhostId(null);
  }, [snapToBeats, durationMs, setPosOverride]);

  /* ── Frame edge trim drag: updates selected frame[i]'s own audioPositionMs, X+ (forward-only) ── */
  const edgeTrimDragRef = useRef<{
    fromIdx: number; startMs: number; startClientX: number; msPerPx: number;
  } | null>(null);

  const handleEdgeTrimDown = useCallback((e: React.PointerEvent<HTMLDivElement>, idx: number) => {
    e.stopPropagation();
    e.preventDefault();
    edgeTrimDragRef.current = {
      fromIdx: idx,
      startMs: effectiveFrames[idx]?.audioPositionMs ?? 0,
      startClientX: e.clientX,
      msPerPx: timelineW > 0 ? totalTimelineMs / timelineW : 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [effectiveFrames, totalTimelineMs, timelineW]);

  const handleEdgeTrimMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = edgeTrimDragRef.current;
    if (!drag) return;
    const i = drag.fromIdx;
    /* Delta-based: candidateMs = startMs + dragDelta. Forward-only: cannot go below startMs.
       Clamp between prev neighbor + MIN_GAP and next neighbor - MIN_GAP. */
    const deltaMs = (e.clientX - drag.startClientX) * drag.msPerPx;
    const candidateMs = drag.startMs + deltaMs;
    const prevMs = effectiveFrames[i - 1]?.audioPositionMs ?? 0;
    const nextMs = effectiveFrames[i + 1]?.audioPositionMs ?? durationMs;
    const clampedMs = snapToBeats(Math.max(drag.startMs, Math.max(prevMs + MIN_GAP_MS, Math.min(nextMs - MIN_GAP_MS, candidateMs))));
    setPosOverride(effectiveFrames[i].frameId, clampedMs);
  }, [snapToBeats, durationMs, effectiveFrames, setPosOverride]);

  const handleEdgeTrimUp = useCallback(() => {
    edgeTrimDragRef.current = null;
  }, []);

  /* ── Trim-aware audio playback loop ── */
  const trimLoopedRef = useRef(false);
  const prevMusicPlayingRef = useRef(false);
  useEffect(() => {
    /* Loop requires loop mode ([ ] loop points set) and at least one trim boundary */
    if (!hasAudio || !loopRange) { trimLoopedRef.current = false; prevMusicPlayingRef.current = false; return; }
    const hasTrimIn = trimInMs > 0;
    const hasTrimOut = trimOutMs < music.audioDurationMs - 100;
    if (!hasTrimIn && !hasTrimOut) { trimLoopedRef.current = false; prevMusicPlayingRef.current = false; return; }

    const justStarted = !prevMusicPlayingRef.current && music.isPlaying;
    const justStopped = prevMusicPlayingRef.current && !music.isPlaying;
    prevMusicPlayingRef.current = music.isPlaying;

    /* When loop mode is active and user starts playback before trimInMs, snap forward to trimInMs */
    if (hasTrimIn && justStarted && music.playheadMs < trimInMs && !trimLoopedRef.current) {
      trimLoopedRef.current = true;
      music.seek(trimInMs);
      music.play(trimInMs);
      setTimeout(() => { trimLoopedRef.current = false; }, 600);
      return;
    }

    /* Case A: trimOut is before track end — loop when playhead reaches trimOut */
    if (hasTrimOut && music.isPlaying) {
      if (music.playheadMs >= trimOutMs - 30 && !trimLoopedRef.current) {
        trimLoopedRef.current = true;
        music.seek(trimInMs);
        music.play(trimInMs);
        setTimeout(() => { trimLoopedRef.current = false; }, 600);
      }
      return;
    }

    /* Case B: trimIn only — loop back to trimInMs when audio ends naturally */
    if (hasTrimIn && !hasTrimOut && justStopped && !trimLoopedRef.current) {
      trimLoopedRef.current = true;
      music.seek(trimInMs);
      music.play(trimInMs);
      setTimeout(() => { trimLoopedRef.current = false; }, 600);
    }
  }, [hasAudio, loopRange, music.isPlaying, music.playheadMs, trimInMs, trimOutMs, music.audioDurationMs, music.seek, music.play]);

  /* ── Auto scroll to active ── */
  useEffect(() => {
    if (!scrollRef.current || userScrolled || activeIndexEffective < 0) return;
    const fw = frameWidths[activeIndexEffective] ?? FRAME_W;
    const x = frameX(activeIndexEffective);
    const el = scrollRef.current;
    const target = x + fw / 2 - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, [activeIndexEffective, userScrolled, frameX, frameWidths]);

  /* ── Auto scroll while generating ── */
  useEffect(() => {
    if (!scrollRef.current || userScrolled || !isGenerating || frames.length === 0) return;
    const el = scrollRef.current;
    el.scrollLeft = el.scrollWidth;
  }, [frames.length, isGenerating, userScrolled]);

  /* ── Playhead auto-scroll during music playback ── */
  useEffect(() => {
    if (!scrollRef.current || !hasAudio || !music.isPlaying) return;
    const el = scrollRef.current;
    const x = msToX(music.playheadMs);
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const margin = el.clientWidth * 0.15;
    if (x > viewRight - margin || x < viewLeft + margin) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.35);
    }
  }, [music.playheadMs, hasAudio, music.isPlaying, msToX]);

  /* ── Wheel zoom ── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) { setUserScrolled(true); return; }
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(8, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  /* ── Drop audio ── */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) await music.importAudio(file);
  }, [music]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const isEditable = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
    };
    const getTarget = () => {
      /* Always resolve against effectiveFrames (sorted by audioPositionMs) */
      const h = hoveredIdxRef.current;
      if (h >= 0 && h < effectiveFrames.length) return { frame: effectiveFrames[h], idx: h };
      if (activeIndexEffective >= 0) return { frame: effectiveFrames[activeIndexEffective], idx: activeIndexEffective };
      return undefined;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e)) return;
      if (e.code === "Escape") {
        setCtxMenu(null);
        setShowShortcuts(false);
        return;
      }
      if (e.key === "?") { e.preventDefault(); setShowShortcuts((v) => !v); return; }
      if (e.code === "Space") { e.preventDefault(); hasAudio ? musicPlayPause() : playPauseFrames(); }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        /* Navigate in sorted time order (effectiveFrames) */
        if (e.code === "ArrowRight") { const n = effectiveFrames[activeIndexEffective + 1]; if (n) sendTimelineSeek(n.frameId); }
        if (e.code === "ArrowLeft") { const p = effectiveFrames[activeIndexEffective - 1]; if (p) sendTimelineSeek(p.frameId); }
      }
      if (e.code === "KeyK" && !e.ctrlKey && !e.metaKey) {
        const t = getTarget();
        if (t) {
          setPinnedIds((prev) => {
            const next = new Set(prev);
            prev.has(t.frame.frameId) ? next.delete(t.frame.frameId) : next.add(t.frame.frameId);
            return next;
          });
          pinFrame(t.frame.frameId);
        }
      }
      if ((e.code === "KeyD" || e.code === "Backspace") && !e.ctrlKey && !e.metaKey) {
        const t = getTarget();
        if (t) {
          e.preventDefault(); /* prevent browser back-navigation on Backspace */
          deleteFrame(t.frame.frameId);
        }
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const n = parseInt(e.code.replace("Digit", ""), 10);
        if (n >= 1 && n <= 5) { const t = getTarget(); if (t) setRating(t.frame.frameId, n); }
      }
      if (e.key === "[" && !e.ctrlKey && !e.metaKey) {
        const t = getTarget();
        if (!t) return;
        const currentEnd = loopEndIdx >= 0 ? effectiveFrames[loopEndIdx]?.frameId : t.frame.frameId;
        sendLoopSet(t.frame.frameId, currentEnd ?? t.frame.frameId);
      }
      if (e.key === "]" && !e.ctrlKey && !e.metaKey) {
        const t = getTarget();
        if (!t) return;
        const currentStart = loopStartIdx >= 0 ? effectiveFrames[loopStartIdx]?.frameId : t.frame.frameId;
        sendLoopSet(currentStart ?? t.frame.frameId, t.frame.frameId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveFrames, activeIndexEffective, hasAudio, musicPlayPause, playPauseFrames, sendTimelineSeek, pinFrame, deleteFrame, setRating, loopStartIdx, loopEndIdx, sendLoopSet]);

  /* ── SVG dimensions ── */
  const svgW = timelineW;
  const svgH = SECTION_H + WAVEFORM_H;

  /* ── Playhead X ── */
  const playheadX = hasAudio
    ? msToX(music.playheadMs)
    : activeIndexEffective >= 0 ? frameX(activeIndexEffective) + (frameWidths[activeIndexEffective] ?? FRAME_W) / 2 : -1;

  /* ── Render waveform path ── */
  const waveformPath = useMemo(() => {
    if (waveform.length === 0) return "";
    const mid = SECTION_H + WAVEFORM_H / 2;
    const step = svgW / waveform.length;
    let d = `M 0 ${mid}`;
    for (let i = 0; i < waveform.length; i++) {
      const x = i * step;
      const amp = waveform[i] * (WAVEFORM_H / 2) * 0.85;
      d += ` L ${x.toFixed(1)} ${(mid - amp).toFixed(1)}`;
    }
    d += ` L ${svgW} ${mid}`;
    for (let i = waveform.length - 1; i >= 0; i--) {
      const x = i * step;
      const amp = waveform[i] * (WAVEFORM_H / 2) * 0.85;
      d += ` L ${x.toFixed(1)} ${(mid + amp).toFixed(1)}`;
    }
    return d + " Z";
  }, [waveform, svgW]);

  /* ── Context menu ── */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; frameId: string; uri?: string; assetId?: string } | null>(null);
  const openCtx = (e: React.MouseEvent, frame: TimelineFrame) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, frameId: frame.frameId, uri: frame.uri, assetId: frame.assetId });
  };

  /* Drag-vs-click guard */
  const isDraggingFrameRef = useRef(false);

  /* ── Shortcuts overlay ── */
  const [showShortcuts, setShowShortcuts] = useState(false);

  /* ── Empty / loading ── */
  const isEmpty = frames.length === 0 && !hasAudio;

  /* ── Export with effective frames + trim ── */
  const handleExportClick = useCallback(() => {
    onExport({ effectiveFrames, trimInMs, trimOutMs });
  }, [onExport, effectiveFrames, trimInMs, trimOutMs]);

  return (
    <div className="yl-ut-root">
      {/* ── Toolbar ── */}
      <div className="yl-ut-toolbar">
        {/* Left: music controls */}
        <div className="yl-ut-toolbar-left">
          {hasAudio ? (
            <>
              <button className="yl-ut-btn yl-ut-play" onClick={musicPlayPause} title={music.isPlaying ? "Pause music" : "Play music"}>
                {music.isPlaying ? "‖" : "▶"}
              </button>
              <span className="yl-ut-time">{fmtMs(music.playheadMs)}</span>
              <span className="yl-ut-sep">·</span>
              <input
                className="yl-ut-bpm-input"
                value={bpmInput}
                onChange={(e) => setBpmInput(e.target.value)}
                onBlur={() => { const n = parseFloat(bpmInput); if (n > 20 && n < 300) music.setBpm(n); else setBpmInput(String(music.bpm)); }}
                onKeyDown={(e) => { if (e.key === "Enter") { const n = parseFloat(bpmInput); if (n > 20 && n < 300) music.setBpm(n); } }}
                title="BPM"
              />
              <span className="yl-ut-label">BPM</span>
              {music.bpmDetected && <span className="yl-ut-detected">auto</span>}
              <span className="yl-ut-sep">·</span>
              <button
                className={`yl-ut-btn${music.syncMode !== "free" ? " on" : ""}`}
                onClick={() => music.setSyncMode(music.syncMode === "free" ? "beat-locked" : music.syncMode === "beat-locked" ? "section-locked" : "free")}
                title="Cycle sync mode: Free → Beat → Section"
              >
                {music.syncMode === "free" ? "Free" : music.syncMode === "beat-locked" ? "Beat" : "Sec"}
              </button>
              <span className="yl-ut-sep">·</span>
              <button
                className="yl-ut-btn"
                onClick={() => music.addSection(music.playheadMs, Math.min(durationMs, music.playheadMs + 30000))}
                title="Add section at playhead"
              >
                + Section
              </button>
              <button className="yl-ut-btn" onClick={music.autoDetectSections} title="Auto-detect sections">
                Auto
              </button>
              {/* Trim range badge */}
              {(trimInMs > 0 || trimOutMs < durationMs) && (
                <span className="yl-ut-trim-badge" title="Export trim range">
                  {fmtMs(trimInMs)}–{fmtMs(trimOutMs)}
                </span>
              )}
              <button className="yl-ut-btn yl-ut-clear-audio" onClick={music.clearAudio} title="Remove audio">
                ✕ Audio
              </button>
            </>
          ) : (
            <>
              <button className="yl-ut-btn yl-ut-play" onClick={playPauseFrames} title={(hasAudio ? music.isPlaying : isPlaying) ? "Pause" : "Play"}>
                {(hasAudio ? music.isPlaying : isPlaying) ? "‖" : "▶"}
              </button>
              <span className="yl-ut-label">FPS</span>
              {[4, 8, 12, 24].map((f) => (
                <button key={f} className={`yl-ut-fps-btn${playFps === f ? " on" : ""}`} onClick={() => setPlayFps(f)}>{f}</button>
              ))}
              <label className="yl-ut-btn yl-ut-audio-pick" title="Load audio file">
                + Audio
                <input type="file" accept="audio/*" style={{ display: "none" }} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await music.importAudio(file);
                  e.target.value = "";
                }} />
              </label>
            </>
          )}
        </div>

        {/* Right: loop + zoom + export */}
        <div className="yl-ut-toolbar-right">
          {loopStartIdx >= 0 && loopEndIdx >= loopStartIdx && (
            <>
              <span className="yl-ut-loop-badge">Loop {loopStartIdx + 1}–{loopEndIdx + 1}</span>
              <button className="yl-ut-btn yl-ut-loop-clear" onClick={sendLoopClear} title="Clear loop range">✕ Loop</button>
              <span className="yl-ut-sep">·</span>
            </>
          )}
          <button className="yl-ut-btn" onClick={() => setZoom((z) => Math.max(0.5, z * 0.8))} title="Zoom out">−</button>
          <span className="yl-ut-zoom">{Math.round(zoom * 100)}%</span>
          <button className="yl-ut-btn" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} title="Zoom in">+</button>
          <span className="yl-ut-sep">·</span>
          <button
            className="yl-ut-btn yl-ut-export"
            onClick={handleExportClick}
            disabled={frames.length === 0 || exportProgress !== null}
            title="Export video"
          >
            {exportProgress !== null ? `${Math.round(exportProgress)}%` : "Export"}
          </button>
          <button
            className={`yl-ut-btn${recordMode === "recording" ? " on" : ""}`}
            onClick={() => {
              if (recordMode === "recording") {
                sendRecordStop();
                setRecordMode("idle");
                return;
              }
              sendRecordStart("output");
              setRecordMode("recording");
              window.setTimeout(() => setRecordMode("idle"), 900);
            }}
            disabled={frames.length === 0}
            title={recordMode === "recording" ? "Stop capture" : "Capture output from the current timeline"}
          >
            {recordMode === "recording" ? "Stop Rec" : "Record"}
          </button>
          {latestRecordingAsset && (
            <button
              className="yl-ut-btn"
              onClick={() => {
                const link = document.createElement("a");
                link.href = latestRecordingAsset.uri;
                link.download = `ylimit_capture_${latestRecordingAsset.assetId}.svg`;
                link.click();
              }}
              title="Download the latest captured output"
            >
              Save Capture
            </button>
          )}
        </div>
      </div>

      {/* ── Timeline scroll area ── */}
      <div
        ref={scrollRef}
        className={`yl-ut-scroll${dragOver ? " drag-over" : ""}`}
        style={{ height: TIMELINE_H }}
        onScroll={() => setUserScrolled(true)}
        onWheel={handleWheel}
        onClick={handleTimelineClick}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="yl-ut-inner" style={{ width: timelineW, height: TIMELINE_H, position: "relative" }}>

          {/* ── Waveform + Sections SVG ── */}
          <svg
            width={svgW}
            height={svgH}
            style={{ position: "absolute", top: 0, left: 0 }}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
          >
            {/* Section bands */}
            {sections.map((sec) => {
              const sx = msToX(sec.startMs);
              const ex = msToX(sec.endMs);
              const w = Math.max(2, ex - sx);
              const isProposed = sec.isProposed;
              return (
                <g key={sec.id}>
                  {/* Main section rect (click=edit, pointerdown=body move) */}
                  <rect
                    x={sx} y={0} width={w} height={SECTION_H}
                    fill={sec.color}
                    opacity={isProposed ? 0.3 : 0.7}
                    style={{ cursor: "grab" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      /* Use persistent ref — sectionBodyDragRef is already null at onClick time */
                      if (sectionDidMoveRef.current) { sectionDidMoveRef.current = false; return; }
                      setEditingSectionId(sec.id === editingSectionId ? null : sec.id);
                    }}
                    onPointerDown={(e) => handleSectionBodyDown(e, sec.id)}
                  />
                  {isProposed && (
                    <rect x={sx + 0.5} y={0.5} width={w - 1} height={SECTION_H - 1}
                      fill="none" stroke={sec.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  <text x={sx + 4} y={SECTION_H - 4} fill="#fff" fontSize={9}
                    fontFamily="JetBrains Mono, monospace" opacity={0.9}
                    style={{ pointerEvents: "none" }}>
                    {sec.label}
                  </text>
                  {/* Resize handles */}
                  <rect x={sx - HIT / 2} y={0} width={HIT} height={SECTION_H}
                    fill="transparent" style={{ cursor: "ew-resize" }}
                    onPointerDown={(e) => handleSvgPointerDown(e, sec.id, "start")}
                  />
                  <rect x={ex - HIT / 2} y={0} width={HIT} height={SECTION_H}
                    fill="transparent" style={{ cursor: "ew-resize" }}
                    onPointerDown={(e) => handleSvgPointerDown(e, sec.id, "end")}
                  />
                </g>
              );
            })}

            {/* Loop region band */}
            {loopStartIdx >= 0 && loopEndIdx >= loopStartIdx && (() => {
              const lx = frameX(loopStartIdx);
              const rx = frameX(loopEndIdx) + (frameWidths[loopEndIdx] ?? FRAME_W);
              return (
                <rect
                  x={lx} y={SECTION_H} width={Math.max(1, rx - lx)} height={WAVEFORM_H}
                  fill="rgba(110,85,247,0.12)"
                  stroke="rgba(110,85,247,0.4)"
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}

            {/* Waveform path */}
            {waveformPath && (
              <path
                d={waveformPath}
                fill="rgba(110,85,247,0.22)"
                stroke="rgba(110,85,247,0.55)"
                strokeWidth={1}
                style={{ pointerEvents: "none" }}
              />
            )}

            {/* Trim dim overlays */}
            {hasAudio && trimInMs > 0 && (
              <rect x={0} y={SECTION_H} width={Math.max(0, msToX(trimInMs))} height={WAVEFORM_H}
                fill="rgba(0,0,0,0.4)" style={{ pointerEvents: "none" }} />
            )}
            {hasAudio && trimOutMs < durationMs && (
              <rect x={msToX(trimOutMs)} y={SECTION_H} width={Math.max(0, svgW - msToX(trimOutMs))} height={WAVEFORM_H}
                fill="rgba(0,0,0,0.4)" style={{ pointerEvents: "none" }} />
            )}

            {/* Trim in marker */}
            {hasAudio && (
              <g style={{ cursor: "ew-resize" }} onPointerDown={(e) => handleTrimPointerDown(e, "in")}>
                <line x1={msToX(trimInMs)} y1={SECTION_H} x2={msToX(trimInMs)} y2={SECTION_H + WAVEFORM_H}
                  stroke="#22c55e" strokeWidth={2} />
                <polygon
                  fill="#22c55e"
                  points={`${msToX(trimInMs)},${SECTION_H + WAVEFORM_H - 10} ${msToX(trimInMs) + 9},${SECTION_H + WAVEFORM_H} ${msToX(trimInMs)},${SECTION_H + WAVEFORM_H}`}
                />
                {/* Wider hit area */}
                <rect x={msToX(trimInMs) - 6} y={SECTION_H} width={14} height={WAVEFORM_H} fill="transparent" />
              </g>
            )}

            {/* Trim out marker */}
            {hasAudio && (
              <g style={{ cursor: "ew-resize" }} onPointerDown={(e) => handleTrimPointerDown(e, "out")}>
                <line x1={msToX(trimOutMs)} y1={SECTION_H} x2={msToX(trimOutMs)} y2={SECTION_H + WAVEFORM_H}
                  stroke="#ef4444" strokeWidth={2} />
                <polygon
                  fill="#ef4444"
                  points={`${msToX(trimOutMs)},${SECTION_H + WAVEFORM_H - 10} ${msToX(trimOutMs) - 9},${SECTION_H + WAVEFORM_H} ${msToX(trimOutMs)},${SECTION_H + WAVEFORM_H}`}
                />
                <rect x={msToX(trimOutMs) - 8} y={SECTION_H} width={14} height={WAVEFORM_H} fill="transparent" />
              </g>
            )}

            {/* Beat markers */}
            {beats.map((ms, i) => {
              const x = msToX(ms);
              const isBar = i % 4 === 0;
              return (
                <line key={i} x1={x} y1={SECTION_H} x2={x} y2={svgH}
                  stroke={isBar ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}
                  strokeWidth={isBar ? 1 : 0.5}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}

            {/* Playhead line */}
            {playheadX >= 0 && (
              <line
                x1={playheadX} y1={0} x2={playheadX} y2={svgH}
                stroke="#6e55f7" strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            )}
          </svg>

          {/* ── Ruler ── */}
          <div className="yl-ut-ruler" style={{ top: svgH, width: timelineW }}>
            {beats.filter((_, i) => i % 4 === 0).map((ms, i) => (
              <span key={i} className="yl-ut-ruler-tick" style={{ left: msToX(ms) }}>
                {fmtMs(ms)}
              </span>
            ))}
            {!hasAudio && effectiveFrames.map((_, i) => (
              i % Math.max(1, Math.floor(effectiveFrames.length / 10)) === 0 && (
                <span key={i} className="yl-ut-ruler-tick" style={{ left: frameX(i) + (frameWidths[i] ?? FRAME_W) / 2 }}>
                  {i + 1}
                </span>
              )
            ))}
          </div>

          {/* ── Frame strip ── */}
          <div className="yl-ut-frames" style={{ top: svgH + RULER_H, width: timelineW }}>
            {effectiveFrames.map((frame, i) => {
              const isActive = frame.frameId === activeFrameId;
              const isPinned = pinnedIds.has(frame.frameId) || (frame.isPinned ?? false);
              const rating = ratings.get(frame.frameId) ?? 0;
              const inLoop = loopStartIdx >= 0 && loopEndIdx >= 0 && i >= loopStartIdx && i <= loopEndIdx;
              const sectionId = frameTagMap.get(frame.frameId);
              const sec = sectionId ? sections.find((s) => s.id === sectionId) : null;
              const x = frameX(i);
              const fw = frameWidths[i] ?? FRAME_W;
              const isGhost = frame.frameId === frameDragGhostId;
              const isCompressed = overlappingIds.has(frame.frameId);
              return (
                <button
                  key={frame.frameId}
                  className={`yl-ut-frame${isActive ? " active" : ""}${inLoop ? " in-loop" : ""}${isPinned ? " pinned" : ""}${isGhost ? " dragging" : ""}`}
                  style={{
                    position: "absolute",
                    left: x,
                    width: fw,
                    height: FRAME_H,
                    borderTopColor: sec ? sec.color : "rgba(255,255,255,0.08)",
                    opacity: isGhost ? 0.35 : 1,
                  }}
                  draggable={!!frame.uri && !frameDragActiveRef.current}
                  onPointerDown={(e) => handleFramePointerDown(e, i)}
                  onPointerMove={handleFramePointerMove}
                  onPointerUp={handleFramePointerUp}
                  onDragStart={(e) => {
                    if (frameDragActiveRef.current) { e.preventDefault(); return; }
                    if (!frame.uri) { e.preventDefault(); return; }
                    isDraggingFrameRef.current = true;
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("text/uri-list", frame.uri);
                    e.dataTransfer.setData("application/x-ylimit-frame", JSON.stringify({ frameId: frame.frameId, uri: frame.uri, assetId: frame.assetId ?? "" }));
                    const img = (e.currentTarget as HTMLElement).querySelector("img");
                    if (img) {
                      const ghost = img.cloneNode(true) as HTMLImageElement;
                      ghost.style.cssText = "position:fixed;top:-200px;left:0;width:80px;height:45px;opacity:0.85;border-radius:2px;object-fit:cover;";
                      document.body.appendChild(ghost);
                      e.dataTransfer.setDragImage(ghost, 40, 22);
                      requestAnimationFrame(() => document.body.removeChild(ghost));
                    }
                  }}
                  onDragEnd={() => { setTimeout(() => { isDraggingFrameRef.current = false; }, 50); }}
                  onClick={(e) => {
                    if (isDraggingFrameRef.current) return;
                    e.stopPropagation();
                    if (e.shiftKey) {
                      if (loopStartIdx < 0 || loopEndIdx < loopStartIdx) {
                        sendLoopSet(frame.frameId, frame.frameId);
                      } else if (i < loopStartIdx) {
                        sendLoopSet(frame.frameId, effectiveFrames[loopEndIdx]?.frameId ?? frame.frameId);
                      } else {
                        sendLoopSet(effectiveFrames[loopStartIdx].frameId, frame.frameId);
                      }
                    } else {
                      sendTimelineSeek(frame.frameId);
                    }
                  }}
                  onMouseEnter={() => { hoveredIdxRef.current = i; }}
                  onMouseLeave={() => { hoveredIdxRef.current = -1; }}
                  onContextMenu={(e) => openCtx(e, frame)}
                  title={`Frame ${i + 1}${isPinned ? " ★" : ""}${rating ? ` · ${rating}★` : ""}${sec ? ` · ${sec.label}` : ""}`}
                >
                  {frame.uri
                    ? <img src={frame.uri} alt="" loading="lazy" draggable={false} />
                    : <div className="yl-ut-frame-empty" />
                  }
                  {isPinned && <div className="yl-ut-badge pin">★</div>}
                  {rating > 0 && <div className="yl-ut-badge rating">{"★".repeat(rating)}</div>}
                  {isCompressed && <div className="yl-ut-overlap-badge" title="Frames overlap at this position">›</div>}
                  {isActive && <div className="yl-ut-playhead-pip" />}
                  <div className="yl-ut-ordinal">{i + 1}</div>
                  {/* Right-edge trim handle (move next frame) */}
                  {hasAudio && i < effectiveFrames.length - 1 && fw > MIN_FRAME_W + 8 && (
                    <div
                      className="yl-ut-edge-handle"
                      onPointerDown={(e) => handleEdgeTrimDown(e, i)}
                      onPointerMove={handleEdgeTrimMove}
                      onPointerUp={handleEdgeTrimUp}
                    />
                  )}
                </button>
              );
            })}

            {/* Drag ghost (frame thumbnail following pointer) */}
            {frameDragGhostId && (() => {
              const ghostFrame = effectiveFrames.find((f) => f.frameId === frameDragGhostId);
              if (!ghostFrame?.uri) return null;
              return (
                <div
                  ref={ghostDivRef}
                  className="yl-ut-frame-ghost"
                  style={{ left: frameX(effectiveFrames.findIndex(f => f.frameId === frameDragGhostId)) }}
                >
                  <img src={ghostFrame.uri} alt="" draggable={false} />
                </div>
              );
            })()}

            {/* Drop / empty state */}
            {isEmpty && (
              <div className="yl-ut-empty">
                {music.isImporting
                  ? "Analyzing audio…"
                  : dragOver
                  ? "Drop audio here"
                  : "Generate frames · or drop an audio file to start"}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Section editor ── */}
      {editingSection && (
        <SectionEditor
          section={editingSection}
          onUpdate={(patch) => music.updateSection(editingSection.id, patch)}
          onRemove={() => { music.removeSection(editingSection.id); setEditingSectionId(null); }}
          onClose={() => setEditingSectionId(null)}
        />
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="yl-ut-ctx"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          <button onClick={() => {
            const currentEnd = loopEndIdx >= 0 ? effectiveFrames[loopEndIdx]?.frameId : ctxMenu.frameId;
            sendLoopSet(ctxMenu.frameId, currentEnd ?? ctxMenu.frameId);
            setCtxMenu(null);
          }}>Set loop start</button>
          <button onClick={() => {
            const currentStart = loopStartIdx >= 0 ? effectiveFrames[loopStartIdx]?.frameId : ctxMenu.frameId;
            sendLoopSet(currentStart ?? ctxMenu.frameId, ctxMenu.frameId);
            setCtxMenu(null);
          }}>Set loop end</button>
          <div className="yl-ut-ctx-sep" />
          {ctxMenu.uri && onFrameToCanvas && (
            <button onClick={() => { onFrameToCanvas(ctxMenu.uri!); setCtxMenu(null); }}>Paint to canvas</button>
          )}
          {ctxMenu.uri && ctxMenu.assetId && onFrameToReference && (
            <button onClick={() => { onFrameToReference(ctxMenu.assetId!, ctxMenu.uri!); setCtxMenu(null); }}>Use as canvas reference</button>
          )}
          {onFrameRefine && (
            <button onClick={() => { onFrameRefine(ctxMenu.frameId); setCtxMenu(null); }}>Refine</button>
          )}
          <div className="yl-ut-ctx-sep" />
          <button onClick={() => { setRating(ctxMenu.frameId, 0); setCtxMenu(null); }}>Clear rating</button>
          <button onClick={() => {
            setPinnedIds((prev) => {
              const next = new Set(prev);
              prev.has(ctxMenu.frameId) ? next.delete(ctxMenu.frameId) : next.add(ctxMenu.frameId);
              return next;
            });
            pinFrame(ctxMenu.frameId);
            setCtxMenu(null);
          }}>
            {pinnedIds.has(ctxMenu.frameId) ? "Unpin" : "Pin"}
          </button>
          {ctxMenu.uri && (
            <button onClick={() => { const a = document.createElement("a"); a.href = ctxMenu.uri!; a.download = `frame_${ctxMenu.frameId}.png`; a.click(); setCtxMenu(null); }}>
              Save PNG
            </button>
          )}
          <button className="danger" onClick={() => { deleteFrame(ctxMenu.frameId); setCtxMenu(null); }}>Delete</button>
        </div>
      )}

      {/* ── Shortcuts overlay ── */}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
