import { useCallback, useRef, useState } from "react";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { LiveOutput } from "@/components/LiveOutput";
import { PromptBar } from "@/components/PromptBar";
import { UnifiedTimeline } from "@/components/UnifiedTimeline";
import { useKreakloneSession } from "@/hooks/useKreakloneSession";
import { useMusicSync } from "@/hooks/useMusicSync";
import type { CanvasEventPayload } from "@/hooks/useYlimitSession";
import type { CompositionDefaults } from "@/hooks/useBlockComposer";
import { defaultCompositionDefaults } from "@/hooks/useBlockComposer";
import { exportWebM, downloadBlob } from "@/utils/export";
import type { ExportOpts } from "@/components/UnifiedTimeline";

export function Studio() {
  const session = useKreakloneSession();
  const music = useMusicSync();

  const [frameBudget, setFrameBudget] = useState(4);
  const [playFps, setPlayFps] = useState(12);
  const [compositionDefaults, setCompositionDefaults] = useState<CompositionDefaults>(defaultCompositionDefaults);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const importUriRef = useRef<((uri: string) => void) | null>(null);
  const addReferenceUriRef = useRef<((assetId: string, uri: string) => void) | null>(null);
  const [frameTagMap] = useState<Map<string, string>>(new Map());

  const handleCanvasEvent = useCallback((event: CanvasEventPayload) => {
    session.sendCanvasEvent(event);
  }, [session]);

  const handleStrokeComplete = useCallback(() => {
    if (session.status === "connected" && !session.isGenerating) {
      session.sendGenerate(frameBudget);
    }
  }, [frameBudget, session]);

  const handlePromptChange = useCallback(() => {
    if (session.status === "connected" && !session.isGenerating) {
      session.sendGenerate(frameBudget);
    }
  }, [frameBudget, session]);

  const handleFrameToCanvas = useCallback((uri: string) => {
    importUriRef.current?.(uri);
  }, []);

  const handleFrameToReference = useCallback((assetId: string, uri: string) => {
    addReferenceUriRef.current?.(assetId, uri);
  }, []);

  const handleFrameRefine = useCallback((frameId: string) => {
    session.sendTimelineSeek(frameId);
    session.requestRefineByFrameId(frameId).catch(() => {
      // non-blocking integration lane
    });
  }, [session]);

  const handleExport = useCallback(async (opts: ExportOpts) => {
    if (opts.effectiveFrames.length === 0) return;
    setExportProgress(0);
    try {
      const blob = await exportWebM(
        opts.effectiveFrames,
        playFps,
        setExportProgress,
        music.audioBuffer ?? undefined,
        opts.trimInMs,
        opts.trimOutMs,
      );
      downloadBlob(blob, `ylimit_${Date.now()}.webm`);
    } finally {
      setExportProgress(null);
    }
  }, [music.audioBuffer, playFps]);

  return (
    <div className="yl-studio">
      <div className="yl-header-bar">
        <span className="yl-logo">YLIMIT</span>
        <div className="yl-header-center">
          <span
            className="yl-status-dot"
            style={{
              background:
                session.status === "connected"
                  ? "#22c55e"
                  : session.status === "connecting"
                    ? "#f59e0b"
                    : session.status === "error"
                      ? "#ef4444"
                      : "#6b7280"
            }}
          />
        </div>
      </div>

      <div className="yl-work-area">
        <div className="yl-canvas-zone">
          <DrawingCanvas
            sendCanvasEvent={handleCanvasEvent}
            onStrokeComplete={handleStrokeComplete}
            burstCount={frameBudget}
            setBurstCount={setFrameBudget}
            frameCapacity={session.sessionState?.frameCapacity ?? 48}
            setFrameCapacity={session.setFrameCapacity}
            compositionDefaults={compositionDefaults}
            setCompositionDefaults={setCompositionDefaults}
            importUriRef={importUriRef}
            addReferenceUriRef={addReferenceUriRef}
          />
        </div>

        <div className="yl-output-zone">
          <LiveOutput
            liveVariants={session.liveFrames}
            activeVariant={session.activeFrame}
            isGenerating={session.isGenerating}
            sessionState={session.sessionState}
            laneStatuses={session.laneStatuses}
            requestRefine={() => session.activeFrame ? session.requestRefineByFrameId(session.activeFrame.variantId) : Promise.resolve()}
            requestUpscale={() => session.activeFrame ? session.requestUpscaleByAssetId(session.activeFrame.assetId) : Promise.resolve()}
            selectVariant={session.selectFrame}
            burstCount={frameBudget}
            setBurstCount={setFrameBudget}
            composerPreviewUri={null}
          />
        </div>
      </div>

      <div className="yl-prompt-zone">
        <PromptBar
          status={session.status}
          isGenerating={session.isGenerating}
          sendPromptUpdate={session.sendPromptUpdate}
          sendGenerate={session.sendGenerate}
          sendCancel={session.sendCancel}
          burstCount={frameBudget}
          setBurstCount={setFrameBudget}
          onPromptChange={handlePromptChange}
          debounceCountdown={null}
        />
      </div>

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
          deleteFrame={session.deleteFrame}
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
