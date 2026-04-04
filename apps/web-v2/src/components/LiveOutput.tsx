import type React from "react";
import type { PreviewVariant, YlimitSessionHook, LaneStatus } from "@/hooks/useYlimitSession";

const BURST_OPTIONS = [1, 2, 4, 8, 16];

type LiveOutputProps = Pick<
  YlimitSessionHook,
  "liveVariants" | "activeVariant" | "isGenerating" | "sessionState" | "laneStatuses" | "requestRefine" | "requestUpscale" | "selectVariant"
> & {
  burstCount: number;
  setBurstCount: (n: number) => void;
  composerPreviewUri?: string | null;
  bassPulse?: number;
};

function LaneBadge({ label, status }: { label: string; status: LaneStatus }) {
  const color =
    status === "working" ? "#6e55f7" :
    status === "done" ? "#22c55e" :
    status === "error" ? "#ef4444" :
    "rgba(255,255,255,0.12)";
  const isWorking = status === "working";
  return (
    <div className="yl-lane-badge" style={{ borderColor: color }}>
      {isWorking && <span className="yl-lane-pulse" style={{ background: color }} />}
      <span className="yl-lane-label" style={{ color: status === "idle" ? "rgba(255,255,255,0.3)" : color }}>
        {label}
      </span>
      <span className="yl-lane-status" style={{ color }}>
        {status}
      </span>
    </div>
  );
}

function FrameThumb({
  variant,
  isActive,
  onClick,
}: {
  variant: PreviewVariant;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`yl-variant-thumb${isActive ? " active" : ""}`}
      onClick={onClick}
      title={`Variant ${variant.ordinal + 1}`}
    >
      <img src={variant.uri} alt={`Frame ${variant.ordinal + 1}`} loading="lazy" />
      <span className="yl-variant-ordinal">{variant.ordinal + 1}</span>
    </button>
  );
}

export function LiveOutput({
  liveVariants,
  activeVariant,
  isGenerating,
  sessionState,
  laneStatuses,
  requestRefine,
  requestUpscale,
  selectVariant,
  burstCount,
  setBurstCount,
  composerPreviewUri,
  bassPulse = 0,
}: LiveOutputProps) {
  const displayUri = composerPreviewUri ?? activeVariant?.uri ?? null;
  const frameCount = sessionState?.timelineFrames?.length ?? 0;

  return (
    <div className="yl-live-output">
      <div className="yl-lane-status-row">
        <LaneBadge label="Gen" status={laneStatuses.generate} />
        <LaneBadge label="Refine" status={laneStatuses.enhance} />
        <LaneBadge label="Up" status={laneStatuses.upscale} />
        <div className="yl-out-burst-row">
          {BURST_OPTIONS.map((n) => {
            const isActive = burstCount === n;
            /* Bass pulse: glow the active burst button when bass amplitude is high */
            const pulseStyle: React.CSSProperties = isActive && bassPulse > 0.15
              ? { boxShadow: `0 0 ${Math.round(bassPulse * 8)}px rgba(110,85,247,${(bassPulse * 0.8).toFixed(2)})` }
              : {};
            return (
              <button
                key={n}
                className={`yl-out-burst-btn${isActive ? " on" : ""}`}
                onClick={() => setBurstCount(n)}
                title={`${n} frame${n > 1 ? "s" : ""}`}
                style={pulseStyle}
              >
                {n}
              </button>
            );
          })}
        </div>
        {activeVariant && (
          <div className="yl-output-actions">
            <button
              className="yl-action-pill"
              onClick={requestRefine}
              disabled={isGenerating || laneStatuses.enhance === "working"}
              title="Enhance the active frame at higher fidelity"
            >
              Refine
            </button>
            <button
              className="yl-action-pill yl-action-upscale"
              onClick={requestUpscale}
              disabled={isGenerating || laneStatuses.upscale === "working"}
              title="Upscale the active frame to higher resolution"
            >
              Scale
            </button>
          </div>
        )}
      </div>

      <div className="yl-output-main">
        {composerPreviewUri && (
          <div className="yl-preview-badge">PREVIEW</div>
        )}
        {displayUri ? (
          <img className="yl-main-frame" src={displayUri} alt={composerPreviewUri ? "Composer preview" : "Live output"} />
        ) : (
          <div className="yl-main-frame-empty">
            {isGenerating ? (
              <div className="yl-generating-indicator">
                <div className="yl-spinner" />
                <span>Generating…</span>
              </div>
            ) : (
              <span className="yl-empty-label">Output appears here</span>
            )}
          </div>
        )}
        {isGenerating && displayUri && (
          <div className="yl-generating-overlay">
            <div className="yl-spinner-small" />
          </div>
        )}
      </div>

      <div className="yl-output-meta">
        <span className="yl-meta-item">
          {frameCount} frame{frameCount !== 1 ? "s" : ""}
        </span>
        {activeVariant && (
          <>
            <span className="yl-meta-sep">·</span>
            <span className="yl-meta-item">variant {activeVariant.ordinal + 1}</span>
            <span className="yl-meta-sep">·</span>
            <span className="yl-meta-item yl-mono">{activeVariant.assetId.slice(0, 8)}</span>
          </>
        )}
        {isGenerating && (
          <>
            <span className="yl-meta-sep">·</span>
            <span className="yl-meta-item yl-generating-pulse">generating</span>
          </>
        )}
      </div>

      {liveVariants.length > 0 && (
        <div className="yl-variants-strip">
          <div className="yl-variants-label">Variants</div>
          <div className="yl-variants-row">
            {liveVariants.map((v) => (
              <FrameThumb
                key={v.variantId}
                variant={v}
                isActive={v.variantId === activeVariant?.variantId}
                onClick={() => selectVariant(v)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
