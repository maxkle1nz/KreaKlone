import { useCallback, useEffect, useRef, useState } from "react";
import { useYlimitSession } from "@/hooks/useYlimitSession";
import { useMusicSync } from "@/hooks/useMusicSync";
import type { MusicSection } from "@/hooks/useMusicSync";
import type { CanvasEventPayload } from "@/hooks/useYlimitSession";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { LiveOutput } from "@/components/LiveOutput";
import { PromptBar } from "@/components/PromptBar";
import { UnifiedTimeline } from "@/components/UnifiedTimeline";
import { exportWebM, downloadBlob } from "@/utils/export";
import type { ExportOpts } from "@/components/UnifiedTimeline";
import type { CompositionDefaults } from "@/hooks/useBlockComposer";
import { defaultCompositionDefaults } from "@/hooks/useBlockComposer";

/* ── Constants ── */
const DEBOUNCE_MS = 1200;

const STATUS_DOT: Record<string, string> = {
  connected: "#22c55e",
  connecting: "#f59e0b",
  error: "#ef4444",
  disconnected: "#6b7280",
};

/* ── Performance HUD ── */
type PerfHudProps = {
  section: MusicSection | null;
  bpm: number;
  isPlaying: boolean;
  isSynced: boolean;
  onPlayPause: () => void;
  onToggleSync: () => void;
  onExit: () => void;
};

function PerfHud({ section, bpm, isPlaying, isSynced, onPlayPause, onToggleSync, onExit }: PerfHudProps) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!isPlaying) { setBeat(0); return; }
    const intervalMs = (60 / bpm) * 1000;
    const id = setInterval(() => setBeat((b) => (b + 1) % 4), intervalMs);
    return () => clearInterval(id);
  }, [isPlaying, bpm]);

  return (
    <div className="yl-perf-hud">
      <div className="yl-perf-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`yl-perf-dot${beat === i && isPlaying ? " active" : ""}`} />
        ))}
      </div>
      <div className="yl-perf-bpm">{bpm} BPM</div>
      {section && <div className="yl-perf-section" style={{ color: section.color }}>{section.label}</div>}
      <div className="yl-perf-controls">
        <button onClick={onPlayPause}>{isPlaying ? "‖" : "▶"}</button>
        <button className={isSynced ? "on" : ""} onClick={onToggleSync}>{isSynced ? "Sync" : "Free"}</button>
        <button onClick={onExit}>Exit Stage</button>
      </div>
    </div>
  );
}

/* ── Studio ── */
export function Studio() {
  const session = useYlimitSession();
  const music = useMusicSync();

  const [burstCount, setBurstCount] = useState(4);
  const [debounceProgress, setDebounceProgress] = useState<number | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [bassPulse, setBassPulse] = useState(0);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [playFps, setPlayFps] = useState(12);
  const [compositionDefaults, setCompositionDefaults] = useState<CompositionDefaults>(defaultCompositionDefaults);

  const hudHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewStopRef = useRef(false);
  const pendingSectionTagRef = useRef<{ sectionId: string; remaining: number } | null>(null);
  const prevFrameIdsRef = useRef<Set<string>>(new Set());
  const importUriRef = useRef<((uri: string) => void) | null>(null);
  const addReferenceUriRef = useRef<((assetId: string, uri: string) => void) | null>(null);

  /* ── Section-frame tagging ── */
  const [frameTagMap, setFrameTagMap] = useState<Map<string, string>>(new Map());
  const [lastRoi, setLastRoi] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const frameTagLoadedRef = useRef<string | null>(null);

  /* Load frameTagMap from localStorage when session starts */
  useEffect(() => {
    if (!session.sessionId || frameTagLoadedRef.current === session.sessionId) return;
    frameTagLoadedRef.current = session.sessionId;
    try {
      const raw = localStorage.getItem(`ylimit_frametags_${session.sessionId}`);
      if (raw) setFrameTagMap(new Map(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [session.sessionId]);

  /* Persist frameTagMap to localStorage on every change */
  useEffect(() => {
    if (!session.sessionId) return;
    try {
      localStorage.setItem(`ylimit_frametags_${session.sessionId}`, JSON.stringify([...frameTagMap]));
    } catch { /* ignore */ }
  }, [frameTagMap, session.sessionId]);

  /* Tag new frames arriving after a sync trigger */
  useEffect(() => {
    const frames = session.sessionState?.timelineFrames ?? [];
    const currentIds = new Set(frames.map((f) => f.frameId));
    const pending = pendingSectionTagRef.current;
    if (pending && pending.remaining > 0) {
      const newIds: string[] = [];
      currentIds.forEach((id) => { if (!prevFrameIdsRef.current.has(id)) newIds.push(id); });
      if (newIds.length > 0) {
        setFrameTagMap((prev) => {
          const next = new Map(prev);
          newIds.forEach((id) => next.set(id, pending.sectionId));
          return next;
        });
        const stillRemaining = pending.remaining - newIds.length;
        pendingSectionTagRef.current = stillRemaining <= 0 ? null : { ...pending, remaining: stillRemaining };
      }
    }
    prevFrameIdsRef.current = currentIds;
  }, [session.sessionState?.timelineFrames]);

  /* ── Performance mode ── */
  const enterPerformanceMode = useCallback(() => {
    setPerformanceMode(true);
    setHudVisible(true);
    try { document.documentElement.requestFullscreen?.(); } catch { /* ignore */ }
  }, []);

  const exitPerformanceMode = useCallback(() => {
    setPerformanceMode(false);
    setHudVisible(true);
    try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement && performanceMode) exitPerformanceMode(); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [performanceMode, exitPerformanceMode]);

  /* Bass pulse */
  useEffect(() => {
    if (!music.isPlaying || music.syncMode === "free") { setBassPulse(0); return; }
    let rafId: number;
    const tick = () => { const { bass } = music.getFrequencyBands(); setBassPulse(bass); rafId = requestAnimationFrame(tick); };
    rafId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafId); setBassPulse(0); };
  }, [music.isPlaying, music.syncMode, music.getFrequencyBands]);

  /* HUD auto-hide */
  const resetHudTimer = useCallback(() => {
    setHudVisible(true);
    if (hudHideTimer.current) clearTimeout(hudHideTimer.current);
    hudHideTimer.current = setTimeout(() => setHudVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!performanceMode) return;
    window.addEventListener("mousemove", resetHudTimer);
    resetHudTimer();
    return () => { window.removeEventListener("mousemove", resetHudTimer); if (hudHideTimer.current) clearTimeout(hudHideTimer.current); };
  }, [performanceMode, resetHudTimer]);

  useEffect(() => {
    if (!performanceMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === "Escape") exitPerformanceMode(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [performanceMode, exitPerformanceMode]);

  /* ── Debounce auto-generate ── */
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceStart = useRef<number>(0);

  const clearDebounce = useCallback(() => {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
    setDebounceProgress(null);
  }, []);

  const scheduleAutoGenerate = useCallback(() => {
    if (session.status !== "connected" || session.isGenerating) return;
    clearDebounce();
    debounceStart.current = Date.now();
    setDebounceProgress(100);
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - debounceStart.current;
      const remaining = Math.max(0, 100 - (elapsed / DEBOUNCE_MS) * 100);
      setDebounceProgress(remaining);
      if (elapsed >= DEBOUNCE_MS) { clearInterval(progressTimer.current!); progressTimer.current = null; setDebounceProgress(null); }
    }, 40);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      if (session.status === "connected" && !session.isGenerating) session.sendGenerate(burstCount);
      clearDebounce();
    }, DEBOUNCE_MS);
  }, [session.status, session.isGenerating, session.sendGenerate, burstCount, clearDebounce]);

  const handleCanvasEvent = useCallback((event: CanvasEventPayload) => {
    if (event.type === "region.set") setLastRoi({ x: event.x, y: event.y, w: event.width, h: event.height });
    session.sendCanvasEvent(event);
  }, [session]);

  const handleStrokeComplete = useCallback(() => scheduleAutoGenerate(), [scheduleAutoGenerate]);
  const handlePromptChange = useCallback(() => scheduleAutoGenerate(), [scheduleAutoGenerate]);

  /* ── G key: immediate generate ── */
  useEffect(() => {
    const isEditable = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e)) return;
      if (e.code === "KeyG" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (session.status !== "connected" || session.isGenerating) return;
        clearDebounce();
        session.sendGenerate(burstCount);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.status, session.isGenerating, session.sendGenerate, burstCount, clearDebounce]);

  /* ── Frame → canvas / reference / refine callbacks ── */
  const handleFrameToCanvas = useCallback((uri: string) => {
    importUriRef.current?.(uri);
  }, []);

  const handleFrameToReference = useCallback((assetId: string, uri: string) => {
    addReferenceUriRef.current?.(assetId, uri);
  }, []);

  const handleFrameRefine = useCallback((frameId: string) => {
    session.sendTimelineSeek(frameId);
    session.requestRefineByFrameId(frameId).catch(() => { /* non-blocking */ });
  }, [session.sendTimelineSeek, session.requestRefineByFrameId]);

  /* ── Music sync trigger ── */
  const handleSyncTrigger = useCallback((
    beatMs: number,
    section: MusicSection | null,
    triggerBurst: number
  ) => {
    if (session.status !== "connected" || session.isGenerating) return;
    if (section?.canvasState) {
      const { prompt, negativePrompt, styleTags, roi, palette } = section.canvasState;
      const palettePart = palette?.length ? palette.join(" ") : "";
      const positivePrompt = [prompt, palettePart, styleTags].filter(Boolean).join(", ");
      session.sendPromptUpdate(positivePrompt || "", negativePrompt || "");
      if (roi) session.sendCanvasEvent({ type: "region.set", x: roi.x, y: roi.y, width: roi.w, height: roi.h });
    }
    const { bass } = music.getFrequencyBands();
    const fftMultiplier = 1 + Math.round(bass * 2);
    const effectiveBurst = Math.min(16, triggerBurst * fftMultiplier);
    if (section) pendingSectionTagRef.current = { sectionId: section.id, remaining: effectiveBurst };
    session.sendGenerate(effectiveBurst, beatMs);
  }, [session, music]);

  const handleSyncTriggerRef = useRef(handleSyncTrigger);
  handleSyncTriggerRef.current = handleSyncTrigger;

  useEffect(() => {
    if (music.isPlaying && music.syncMode !== "free") {
      music.startSyncScheduler(({ beatMs, section, burstCount }) => {
        handleSyncTriggerRef.current(beatMs, section, burstCount);
      });
    } else {
      music.stopSyncScheduler();
    }
    return () => music.stopSyncScheduler();
  }, [music.isPlaying, music.syncMode, music.startSyncScheduler, music.stopSyncScheduler]);

  /* ── Export WebM (with audio if loaded) ── */
  const handleExport = useCallback(async (opts: ExportOpts) => {
    const { effectiveFrames, trimInMs, trimOutMs } = opts;
    if (effectiveFrames.length === 0) return;
    setExportProgress(0);
    try {
      const hasAudio = !!music.audioBuffer;
      let exportFrames = effectiveFrames;
      if (hasAudio) {
        /* Frames strictly inside [trimInMs, trimOutMs) */
        const framesInRange = effectiveFrames.filter((f) => {
          const pos = f.audioPositionMs ?? 0;
          return pos >= trimInMs && pos < trimOutMs;
        });
        /* Carry-in: last frame at or before trimInMs — anchored to trimInMs so video
           timeline starts exactly there (avoids gap when trimInMs falls between beats) */
        const sortedByPos = [...effectiveFrames].sort((a, b) => (a.audioPositionMs ?? 0) - (b.audioPositionMs ?? 0));
        const carryIn = sortedByPos.reverse().find((f) => (f.audioPositionMs ?? 0) <= trimInMs);
        if (carryIn) {
          const anchoredCarryIn: typeof carryIn = { ...carryIn, audioPositionMs: trimInMs };
          const alreadyInRange = framesInRange.some((f) => f.frameId === carryIn.frameId);
          exportFrames = alreadyInRange ? framesInRange : [anchoredCarryIn, ...framesInRange];
        } else {
          exportFrames = framesInRange;
        }
      }
      if (exportFrames.length === 0) return;
      const blob = await exportWebM(
        exportFrames,
        playFps,
        setExportProgress,
        music.audioBuffer,
        hasAudio ? trimInMs : undefined,
        hasAudio ? trimOutMs : undefined,
      );
      downloadBlob(blob, `ylimit_${Date.now()}.webm`);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExportProgress(null);
    }
  }, [playFps, music.audioBuffer]);

  /* ── Performance mode render ── */
  const perfSection = music.audioBuffer ? music.getSectionAtMs(music.playheadMs) : null;

  const perfPlayPause = useCallback(() => {
    if (music.isPlaying) music.pause(); else music.play(music.playheadMs);
  }, [music]);

  const perfToggleSync = useCallback(() => {
    music.setSyncMode(music.syncMode === "free" ? "beat-locked" : "free");
  }, [music]);

  if (performanceMode) {
    return (
      <div className="yl-studio yl-perf">
        <div className="yl-perf-output">
          <LiveOutput
            liveVariants={session.liveVariants}
            activeVariant={session.activeVariant}
            isGenerating={session.isGenerating}
            sessionState={session.sessionState}
            laneStatuses={session.laneStatuses}
            requestRefine={session.requestRefine}
            requestUpscale={session.requestUpscale}
            selectVariant={session.selectVariant}
            burstCount={burstCount}
            setBurstCount={setBurstCount}
            composerPreviewUri={null}
            bassPulse={bassPulse}
          />
        </div>
        {hudVisible && (
          <PerfHud
            section={perfSection}
            bpm={music.bpm}
            isPlaying={music.isPlaying}
            isSynced={music.syncMode !== "free"}
            onPlayPause={perfPlayPause}
            onToggleSync={perfToggleSync}
            onExit={exitPerformanceMode}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`yl-studio${zenMode ? " yl-zen" : ""}`}>
      {/* ── Header ── */}
      <div className="yl-header-bar">
        <span className="yl-logo">YL</span>
        <div className="yl-header-center">
          <span
            className="yl-status-dot"
            style={{ background: STATUS_DOT[session.status] ?? "#6b7280" }}
            title={session.status}
          />
          {music.audioBuffer && (
            <span className="yl-header-audio-badge">
              {music.audioFileName?.replace(/\.[^.]+$/, "") ?? "audio"} · {music.bpm} BPM
            </span>
          )}
        </div>
        <div className="yl-header-right">
          <button
            className="yl-compose-toggle yl-stage-btn"
            onClick={enterPerformanceMode}
            title="Enter stage mode (fullscreen output)"
          >
            Stage
          </button>
          <button
            className={`yl-zen-toggle${zenMode ? " active" : ""}`}
            onClick={() => setZenMode((v) => !v)}
            title={zenMode ? "Exit zen mode" : "Zen mode"}
          >
            {zenMode ? "◎" : "◉"}
          </button>
        </div>
      </div>

      {/* ── Work area: canvas + output ── */}
      <div className="yl-work-area">
        <div className="yl-canvas-zone">
          <DrawingCanvas
            sendCanvasEvent={handleCanvasEvent}
            onStrokeComplete={handleStrokeComplete}
            burstCount={burstCount}
            setBurstCount={setBurstCount}
            frameCapacity={session.sessionState?.frameCapacity ?? 200}
            setFrameCapacity={session.setFrameCapacity}
            compositionDefaults={compositionDefaults}
            setCompositionDefaults={setCompositionDefaults}
            importUriRef={importUriRef}
            addReferenceUriRef={addReferenceUriRef}
          />
        </div>
        <div className="yl-output-zone">
          <LiveOutput
            liveVariants={session.liveVariants}
            activeVariant={session.activeVariant}
            isGenerating={session.isGenerating}
            sessionState={session.sessionState}
            laneStatuses={session.laneStatuses}
            requestRefine={session.requestRefine}
            requestUpscale={session.requestUpscale}
            selectVariant={session.selectVariant}
            burstCount={burstCount}
            setBurstCount={setBurstCount}
            composerPreviewUri={null}
            bassPulse={bassPulse}
          />
        </div>
      </div>

      {/* ── Prompt bar ── */}
      <div className="yl-prompt-zone">
        <PromptBar
          status={session.status}
          isGenerating={session.isGenerating}
          sendPromptUpdate={session.sendPromptUpdate}
          sendGenerate={session.sendGenerate}
          sendCancel={session.sendCancel}
          burstCount={burstCount}
          setBurstCount={setBurstCount}
          onPromptChange={handlePromptChange}
          debounceCountdown={debounceProgress}
        />
      </div>

      {/* ── Unified Timeline (THE editing surface) ── */}
      <div className="yl-timeline-zone">
        <UnifiedTimeline
          sessionId={session.sessionId}
          sessionState={session.sessionState}
          isGenerating={session.isGenerating}
          music={music}
          sendTimelineSeek={session.sendTimelineSeek}
          sendTimelinePlay={session.sendTimelinePlay}
          sendTimelinePause={session.sendTimelinePause}
          sendLoopSet={session.sendLoopSet}
          sendLoopClear={session.sendLoopClear}
          deleteFrame={session.deleteTimelineFrame}
          onExport={handleExport}
          exportProgress={exportProgress}
          frameTagMap={frameTagMap}
          onFrameToCanvas={handleFrameToCanvas}
          onFrameToReference={handleFrameToReference}
          onFrameRefine={handleFrameRefine}
          playFps={playFps}
          setPlayFps={setPlayFps}
        />
      </div>
    </div>
  );
}
