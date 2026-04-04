import { useRef, useCallback, useState, useEffect } from "react";
import type React from "react";
import type { CanvasEventPayload } from "@/hooks/useYlimitSession";
import { CompositionDefaultsPanel } from "@/components/CompositionPanel";
import type { CompositionDefaults } from "@/hooks/useBlockComposer";

export type DrawMode = "brush" | "erase" | "region";

const FRAME_CAP_OPTIONS = [50, 100, 200];

export type DrawingCanvasProps = {
  sendCanvasEvent: (event: CanvasEventPayload) => void;
  onStrokeComplete: () => void;
  burstCount: number;
  setBurstCount: (n: number) => void;
  frameCapacity: number;
  setFrameCapacity: (n: number) => void;
  compositionDefaults: CompositionDefaults | null;
  setCompositionDefaults: (d: CompositionDefaults) => void;
  importUriRef?: React.MutableRefObject<((uri: string) => void) | null>;
  addReferenceUriRef?: React.MutableRefObject<((assetId: string, uri: string) => void) | null>;
};

type ReferenceImage = { id: string; uri: string; assetId: string };

const CANVAS_W = 1280;
const CANVAS_H = 720;

let strokeCounter = 0;
const newStrokeId = () => `stroke_${Date.now()}_${++strokeCounter}`;

async function uploadImage(dataUrl: string): Promise<{ assetId: string; uri: string } | null> {
  try {
    const res = await fetch("/api/assets/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uri: dataUrl, mimeType: "image/png" }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const COLORS = [
  "#a78bfa", "#60a5fa", "#34d399",
  "#fbbf24", "#f87171", "#f0f0f0", "#111111",
];

const BURST_OPTIONS = [1, 2, 4, 8, 16];

export function DrawingCanvas({ sendCanvasEvent, onStrokeComplete, burstCount, setBurstCount, frameCapacity, setFrameCapacity, compositionDefaults, setCompositionDefaults, importUriRef, addReferenceUriRef }: DrawingCanvasProps) {
  const drawRef = useRef<HTMLCanvasElement>(null);
  const roiRef = useRef<HTMLCanvasElement>(null);

  const isDrawing = useRef(false);
  const currentStrokeId = useRef("");
  const currentPoints = useRef<number[]>([]);
  const roiStart = useRef<[number, number] | null>(null);

  const [mode, setMode] = useState<DrawMode>("brush");
  const [brushSize, setBrushSize] = useState(14);
  const [brushColor, setBrushColor] = useState(COLORS[0]);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverRef, setDragOverRef] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [anyFrameDragging, setAnyFrameDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const getCanvasPos = useCallback((e: PointerEvent): [number, number] => {
    const canvas = drawRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    ];
  }, []);

  const drawSegment = useCallback(
    (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
      ctx.save();
      if (mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = brushColor;
      }
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    },
    [mode, brushSize, brushColor]
  );

  const drawRoiRect = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    const ctx = roiRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.save();
    ctx.strokeStyle = "#6e55f7";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = "rgba(110,85,247,0.07)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawing.current = true;
      const [x, y] = getCanvasPos(e.nativeEvent);
      if (mode === "region") {
        roiStart.current = [x, y];
        roiRef.current?.getContext("2d")?.clearRect(0, 0, CANVAS_W, CANVAS_H);
      } else {
        currentStrokeId.current = newStrokeId();
        currentPoints.current = [x, y, x, y];
        const ctx = drawRef.current?.getContext("2d");
        if (ctx) drawSegment(ctx, x, y, x, y);
      }
    },
    [getCanvasPos, mode, drawSegment]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current) return;
      const [x, y] = getCanvasPos(e.nativeEvent);
      if (mode === "region") {
        if (roiStart.current) drawRoiRect(roiStart.current[0], roiStart.current[1], x, y);
      } else {
        const pts = currentPoints.current;
        const [px, py] = [pts[pts.length - 2], pts[pts.length - 1]];
        if (Math.hypot(x - px, y - py) < 1.5) return;
        currentPoints.current = [...pts, x, y];
        const ctx = drawRef.current?.getContext("2d");
        if (ctx) drawSegment(ctx, px, py, x, y);
      }
    },
    [getCanvasPos, mode, drawSegment, drawRoiRect]
  );

  const commitStroke = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      const [x, y] = getCanvasPos(e.nativeEvent);
      if (mode === "region") {
        if (roiStart.current) {
          const [sx, sy] = roiStart.current;
          const rx = Math.round(Math.min(sx, x));
          const ry = Math.round(Math.min(sy, y));
          const rw = Math.round(Math.abs(x - sx));
          const rh = Math.round(Math.abs(y - sy));
          if (rw > 4 && rh > 4) {
            sendCanvasEvent({ type: "region.set", x: rx, y: ry, width: rw, height: rh });
            onStrokeComplete();
          }
          roiStart.current = null;
        }
      } else {
        const pts = currentPoints.current;
        if (pts.length >= 4) {
          sendCanvasEvent({
            type: mode === "erase" ? "erase" : "brush",
            strokeId: currentStrokeId.current,
            layerId: "base",
            size: brushSize,
            points: pts,
          });
          onStrokeComplete();
        }
        currentPoints.current = [];
      }
    },
    [mode, brushSize, sendCanvasEvent, onStrokeComplete, getCanvasPos]
  );

  const handleClear = useCallback(() => {
    drawRef.current?.getContext("2d")?.clearRect(0, 0, CANVAS_W, CANVAS_H);
    roiRef.current?.getContext("2d")?.clearRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  const importFileToCanvas = useCallback(async (file: File) => {
    const url = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = (ev) => res(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
    const ctx = drawRef.current?.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = async () => {
      const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
      const dx = (CANVAS_W - img.width * scale) / 2;
      const dy = (CANVAS_H - img.height * scale) / 2;
      ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
      const asset = await uploadImage(url);
      if (asset) sendCanvasEvent({ type: "image.import", assetId: asset.assetId, uri: asset.uri, x: 0, y: 0 });
      onStrokeComplete();
    };
    img.src = url;
  }, [sendCanvasEvent, onStrokeComplete]);

  const addReference = useCallback(async (file: File) => {
    const url = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = (ev) => res(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
    const asset = await uploadImage(url);
    if (!asset) return;
    setReferences((prev) => [...prev, { id: `ref_${Date.now()}`, uri: asset.uri, assetId: asset.assetId }]);
    sendCanvasEvent({ type: "reference.add", assetId: asset.assetId, uri: asset.uri });
  }, [sendCanvasEvent]);

  const removeReference = useCallback((ref: ReferenceImage) => {
    setReferences((prev) => prev.filter((r) => r.id !== ref.id));
    sendCanvasEvent({ type: "reference.remove", assetId: ref.assetId });
  }, [sendCanvasEvent]);

  const importUriFromUrl = useCallback((uri: string) => {
    const ctx = drawRef.current?.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height);
      const dx = (CANVAS_W - img.width * scale) / 2;
      const dy = (CANVAS_H - img.height * scale) / 2;
      ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
      sendCanvasEvent({ type: "image.import", assetId: "timeline-frame", uri, x: 0, y: 0 });
      onStrokeComplete();
    };
    img.src = uri;
  }, [sendCanvasEvent, onStrokeComplete]);

  const addReferenceFromUri = useCallback((assetId: string, uri: string) => {
    setReferences((prev) => [...prev, { id: `ref_${Date.now()}`, uri, assetId }]);
    sendCanvasEvent({ type: "reference.add", assetId, uri });
  }, [sendCanvasEvent]);

  useEffect(() => {
    if (importUriRef) importUriRef.current = importUriFromUrl;
    if (addReferenceUriRef) addReferenceUriRef.current = addReferenceFromUri;
  }, [importUriFromUrl, addReferenceFromUri, importUriRef, addReferenceUriRef]);

  /* Detect global frame-drag so we can show the reference-badge hint */
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("application/x-ylimit-frame")) {
        setAnyFrameDragging(true);
      }
    };
    const onEnd = () => setAnyFrameDragging(false);
    document.addEventListener("dragstart", onStart);
    document.addEventListener("dragend", onEnd);
    document.addEventListener("drop", onEnd);
    return () => {
      document.removeEventListener("dragstart", onStart);
      document.removeEventListener("dragend", onEnd);
      document.removeEventListener("drop", onEnd);
    };
  }, []);

  /* ── Canvas drop (img2img base) ── */
  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes("application/x-ylimit-frame") || types.includes("text/uri-list") || types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }, []);
  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }, []);
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    /* Prefer frame payload, then uri-list, then file */
    const frameJson = e.dataTransfer.getData("application/x-ylimit-frame");
    if (frameJson) {
      try {
        const { uri } = JSON.parse(frameJson) as { uri: string };
        if (uri) { importUriFromUrl(uri); return; }
      } catch { /* ignore */ }
    }
    const uriList = e.dataTransfer.getData("text/uri-list");
    if (uriList) {
      const first = uriList.split(/[\r\n]+/).find((l) => l && !l.startsWith("#"));
      if (first) { importUriFromUrl(first); return; }
    }
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) importFileToCanvas(file);
  }, [importUriFromUrl, importFileToCanvas]);

  /* ── Reference drop zone ── */
  const handleRefDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes("application/x-ylimit-frame") || types.includes("text/uri-list") || types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setDragOverRef(true);
    }
  }, []);
  const handleRefDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverRef(false);
  }, []);
  const handleRefDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRef(false);
    setAnyFrameDragging(false);
    /* Prefer frame payload */
    const frameJson = e.dataTransfer.getData("application/x-ylimit-frame");
    if (frameJson) {
      try {
        const { assetId, uri } = JSON.parse(frameJson) as { assetId: string; uri: string };
        if (uri) { addReferenceFromUri(assetId || `ref_${Date.now()}`, uri); return; }
      } catch { /* ignore */ }
    }
    const uriList = e.dataTransfer.getData("text/uri-list");
    if (uriList) {
      const first = uriList.split(/[\r\n]+/).find((l) => l && !l.startsWith("#"));
      if (first) { addReferenceFromUri(`ref_${Date.now()}`, first); return; }
    }
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) addReference(file);
  }, [addReferenceFromUri, addReference]);

  const cursor = mode === "erase" ? "cell" : "crosshair";

  return (
    <div className="yl-canvas-zone-inner">
      <div className="yl-pixel-toolbar">
        <div className="yl-ptb-group">
          <button
            className={`yl-ptb-btn${mode === "brush" ? " on" : ""}`}
            onClick={() => setMode("brush")}
            title="Brush"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="8" width="2" height="3" fill="currentColor" />
              <rect x="2" y="6" width="2" height="2" fill="currentColor" />
              <rect x="3" y="4" width="2" height="2" fill="currentColor" />
              <rect x="5" y="2" width="2" height="2" fill="currentColor" />
              <rect x="7" y="1" width="4" height="2" fill="currentColor" />
              <rect x="9" y="3" width="2" height="2" fill="currentColor" />
            </svg>
          </button>
          <button
            className={`yl-ptb-btn${mode === "erase" ? " on" : ""}`}
            onClick={() => setMode("erase")}
            title="Erase"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="5" width="4" height="4" fill="currentColor" />
              <rect x="4" y="3" width="4" height="4" fill="currentColor" />
              <rect x="7" y="2" width="4" height="3" fill="currentColor" />
              <rect x="1" y="9" width="10" height="1" fill="currentColor" opacity="0.4" />
            </svg>
          </button>
          <button
            className={`yl-ptb-btn${mode === "region" ? " on" : ""}`}
            onClick={() => setMode("region")}
            title="Select region"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="1" width="2" height="1" fill="currentColor" />
              <rect x="9" y="1" width="2" height="1" fill="currentColor" />
              <rect x="1" y="10" width="2" height="1" fill="currentColor" />
              <rect x="9" y="10" width="2" height="1" fill="currentColor" />
              <rect x="1" y="1" width="1" height="4" fill="currentColor" />
              <rect x="1" y="7" width="1" height="4" fill="currentColor" />
              <rect x="10" y="1" width="1" height="4" fill="currentColor" />
              <rect x="10" y="7" width="1" height="4" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="yl-ptb-sep" />

        <div className="yl-ptb-group yl-ptb-colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`yl-ptb-swatch${brushColor === c && mode === "brush" ? " on" : ""}`}
              style={{ background: c }}
              onClick={() => { setBrushColor(c); setMode("brush"); }}
            />
          ))}
        </div>

        <div className="yl-ptb-sep" />

        <div className="yl-ptb-group yl-ptb-size">
          <input
            type="range" min={1} max={80} value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="yl-ptb-slider"
            title={`Size: ${brushSize}`}
          />
        </div>

        <div className="yl-ptb-sep" />

        <div className="yl-ptb-group">
          <button
            className={`yl-ptb-btn${showConfig ? " on" : ""}${anyFrameDragging ? " yl-ptb-ref-hint" : ""}`}
            onClick={() => setShowConfig((v) => !v)}
            title={anyFrameDragging ? "Drop frame here to add as reference" : "Settings"}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="1" fill="currentColor" />
              <rect x="1" y="5" width="10" height="1" fill="currentColor" />
              <rect x="1" y="8" width="10" height="1" fill="currentColor" />
              <rect x="3" y="1" width="2" height="3" rx="1" fill="currentColor" />
              <rect x="7" y="4" width="2" height="3" rx="1" fill="currentColor" />
              <rect x="4" y="7" width="2" height="3" rx="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="yl-ptb-btn"
            onClick={handleClear}
            title="Clear canvas"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="1" width="1" height="10" fill="currentColor" transform="rotate(-45 2 1)" />
              <rect x="1" y="9" width="1" height="10" fill="currentColor" transform="rotate(-45 1 9)" />
              <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="yl-config-panel">
          <div className="yl-cfg-section">
            <span className="yl-cfg-label">Frames</span>
            <div className="yl-cfg-burst-row">
              {BURST_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`yl-cfg-burst${burstCount === n ? " on" : ""}`}
                  onClick={() => setBurstCount(n)}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                className="yl-cfg-burst-num"
                value={burstCount}
                min={1}
                max={16}
                onChange={(e) => setBurstCount(Math.max(1, Math.min(16, Number(e.target.value))))}
              />
            </div>
          </div>

          <div className="yl-cfg-section">
            <span className="yl-cfg-label">Timeline cap</span>
            <div className="yl-cfg-burst-row">
              {FRAME_CAP_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`yl-cfg-burst${frameCapacity === n ? " on" : ""}`}
                  onClick={() => setFrameCapacity(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {compositionDefaults && (
            <CompositionDefaultsPanel
              defaults={compositionDefaults}
              onChange={setCompositionDefaults}
            />
          )}

          <div className="yl-cfg-section">
            <span className="yl-cfg-label">Import</span>
            <button className="yl-cfg-import" onClick={() => fileInputRef.current?.click()}>
              Canvas image
            </button>
            <button className="yl-cfg-import" onClick={() => refInputRef.current?.click()}>
              + Reference
            </button>
          </div>

          {references.length > 0 && (
            <div className="yl-cfg-section">
              <span className="yl-cfg-label">References</span>
              <div className="yl-cfg-refs">
                {references.map((ref) => (
                  <div key={ref.id} className="yl-cfg-ref-thumb">
                    <img src={ref.uri} alt="ref" />
                    <button onClick={() => removeReference(ref)} className="yl-cfg-ref-x">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className={`yl-canvas-container${dragOver ? " drag-over" : ""}${dragOverRef ? " drag-over-ref" : ""}`}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      >
        <canvas
          ref={drawRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="yl-layer-draw-only"
          style={{ cursor }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={commitStroke}
          onPointerLeave={commitStroke}
        />
        <canvas ref={roiRef} width={CANVAS_W} height={CANVAS_H} className="yl-layer-roi" />
        {dragOver && (
          <div className="yl-drop-overlay">
            <span>Drop to paint</span>
          </div>
        )}
        {/* Reference drop zone — always present; interactive + hinted during any frame drag */}
        <div
          className={`yl-ref-drop-zone${dragOverRef ? " active" : ""}${anyFrameDragging ? " hint" : ""}`}
          onDragOver={handleRefDragOver}
          onDragLeave={handleRefDragLeave}
          onDrop={handleRefDrop}
        >
          {dragOverRef
            ? <span>Drop as reference</span>
            : anyFrameDragging
              ? <span>+ ref</span>
              : null
          }
        </div>
        <div className="yl-canvas-mode-pip">{mode.slice(0, 1).toUpperCase()}</div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importFileToCanvas(f); e.target.value = ""; }} />
      <input ref={refInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addReference(f); e.target.value = ""; }} />
    </div>
  );
}
