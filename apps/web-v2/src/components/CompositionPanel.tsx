import type { CompositionDefaults, TransitionType } from "@/hooks/useBlockComposer";

const TRANSITION_TYPES: { type: TransitionType; label: string }[] = [
  { type: "cut", label: "Cut" },
  { type: "fade", label: "Fade" },
  { type: "cross-dissolve", label: "X-Dissolve" },
  { type: "wipe-right", label: "Wipe" },
  { type: "zoom-in", label: "Zoom In" },
  { type: "zoom-out", label: "Zoom Out" },
];

export type { CompositionDefaults };

export type CompositionDefaultsPanelProps = {
  defaults: CompositionDefaults;
  onChange: (d: CompositionDefaults) => void;
};

export function CompositionDefaultsPanel({ defaults, onChange }: CompositionDefaultsPanelProps) {
  return (
    <div className="yl-cfg-section">
      <span className="yl-cfg-label">Composition defaults</span>
      <div className="yl-cfg-comp-row">
        <span className="yl-cfg-comp-sub">Transition</span>
        <div className="yl-cfg-burst-row" style={{ flexWrap: "wrap" }}>
          {TRANSITION_TYPES.map(({ type, label }) => (
            <button
              key={type}
              className={`yl-cfg-burst${defaults.defaultTransition === type ? " on" : ""}`}
              onClick={() => onChange({ ...defaults, defaultTransition: type })}
              style={{ fontSize: "9px", padding: "0 5px" }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="yl-cfg-comp-sub">Default res</span>
        <div className="yl-cfg-burst-row">
          {(["720p", "1080p", "4k"] as const).map((r) => (
            <button
              key={r}
              className={`yl-cfg-burst${defaults.defaultResolution === r ? " on" : ""}`}
              onClick={() => onChange({ ...defaults, defaultResolution: r })}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="yl-cfg-comp-sub">Default FPS</span>
        <div className="yl-cfg-burst-row">
          {([24, 30, 60] as const).map((f) => (
            <button
              key={f}
              className={`yl-cfg-burst${defaults.defaultFps === f ? " on" : ""}`}
              onClick={() => onChange({ ...defaults, defaultFps: f })}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="yl-cfg-comp-sub">Default format</span>
        <div className="yl-cfg-burst-row">
          {(["mp4", "webm"] as const).map((fmt) => (
            <button
              key={fmt}
              className={`yl-cfg-burst${defaults.defaultFormat === fmt ? " on" : ""}`}
              onClick={() => onChange({ ...defaults, defaultFormat: fmt })}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="yl-cfg-comp-sub">Frames/beat</span>
        <div className="yl-cfg-burst-row">
          {([2, 4, 8, 16] as const).map((n) => (
            <button
              key={n}
              className={`yl-cfg-burst${defaults.framesPerBeat === n ? " on" : ""}`}
              onClick={() => onChange({ ...defaults, framesPerBeat: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
