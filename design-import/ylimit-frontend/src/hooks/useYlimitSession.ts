import { useEffect, useRef, useCallback, useState } from "react";

export type SessionState = {
  sessionId: string;
  version: number;
  prompt: { positive: string; negative: string };
  timelineFrames: TimelineFrame[];
  activeFrameId?: string;
  loopRange?: { startFrameId: string; endFrameId: string };
  frameCapacity?: number;
  latestRefinedAssetId?: string;
  latestUpscaledAssetId?: string;
};

export type TimelineFrame = {
  frameId: string;
  ordinal: number;
  assetId: string;
  uri?: string;
  jobId?: string;
  sessionId?: string;
  sessionVersion?: number;
  seed?: number;
  createdAt?: string;
  isPinned?: boolean;
  audioPositionMs?: number | null;
};

export type PreviewVariant = {
  variantId: string;
  uri: string;
  ordinal: number;
  assetId: string;
  jobId?: string;
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type LaneStatus = "idle" | "working" | "done" | "error";

export type LaneStatuses = {
  generate: LaneStatus;
  enhance: LaneStatus;
  upscale: LaneStatus;
};

export type CanvasEventPayload =
  | { type: "brush"; strokeId: string; layerId: string; size: number; points: number[] }
  | { type: "erase"; strokeId: string; layerId: string; size: number; points: number[] }
  | { type: "prompt.update"; positive: string; negative?: string }
  | { type: "region.set"; x: number; y: number; width: number; height: number }
  | { type: "image.import"; assetId: string; uri: string; x: number; y: number }
  | { type: "reference.add"; assetId: string; uri: string }
  | { type: "reference.remove"; assetId: string };

export type YlimitSessionHook = {
  status: ConnectionStatus;
  sessionId: string | null;
  sessionState: SessionState | null;
  liveVariants: PreviewVariant[];
  activeVariant: PreviewVariant | null;
  isGenerating: boolean;
  lastError: string | null;
  laneStatuses: LaneStatuses;
  enhancedFrameIds: Set<string>;
  upscaledFrameIds: Set<string>;
  sendGenerate: (burstCount?: number, audioPositionMs?: number | null) => void;
  sendCancel: () => void;
  sendCanvasEvent: (event: CanvasEventPayload) => void;
  sendPromptUpdate: (positive: string, negative?: string) => void;
  sendTimelineSeek: (frameId: string) => void;
  sendTimelinePlay: () => void;
  sendTimelinePause: () => void;
  sendLoopSet: (startFrameId: string, endFrameId: string) => void;
  sendLoopClear: () => void;
  deleteTimelineFrame: (frameId: string) => void;
  sendRecordStart: () => void;
  sendRecordStop: () => void;
  selectVariant: (variant: PreviewVariant) => void;
  requestRefine: () => Promise<void>;
  requestRefineByFrameId: (frameId: string) => Promise<void>;
  requestUpscale: () => Promise<void>;
  setFrameCapacity: (n: number) => Promise<void>;
};

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

const MIN_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 30_000;

export function useYlimitSession(): YlimitSessionHook {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [liveVariants, setLiveVariants] = useState<PreviewVariant[]>([]);
  const [activeVariant, setActiveVariant] = useState<PreviewVariant | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [laneStatuses, setLaneStatuses] = useState<LaneStatuses>({
    generate: "idle",
    enhance: "idle",
    upscale: "idle",
  });
  const [enhancedFrameIds, setEnhancedFrameIds] = useState<Set<string>>(new Set());
  const [upscaledFrameIds, setUpscaledFrameIds] = useState<Set<string>>(new Set());

  const ws = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeVariantRef = useRef<PreviewVariant | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(MIN_RECONNECT_MS);
  const isMounted = useRef(true);

  const send = useCallback((msg: object) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const connectWs = useCallback((sid: string) => {
    if (!isMounted.current) return;
    const socket = new WebSocket(buildWsUrl());
    ws.current = socket;

    socket.onopen = () => {
      if (!isMounted.current) return;
      reconnectDelay.current = MIN_RECONNECT_MS;
      setStatus("connected");
      setLastError(null);
      send({ type: "session.join", payload: { sessionId: sid } });
    };

    socket.onmessage = (evt) => {
      if (!isMounted.current) return;
      try {
        const msg = JSON.parse(evt.data);
        handleServerMessageRef.current(msg);
      } catch (_) {}
    };

    socket.onclose = () => {
      if (!isMounted.current) return;
      ws.current = null;
      setStatus("disconnected");
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_MS);
      reconnectTimer.current = setTimeout(() => {
        if (isMounted.current && sessionIdRef.current) connectWs(sessionIdRef.current);
      }, delay);
    };

    socket.onerror = () => {
      if (!isMounted.current) return;
      setStatus("error");
      setLastError("Connection error — reconnecting…");
    };
  }, [send]);

  const handleServerMessageRef = useRef<(msg: { type: string; payload: Record<string, unknown> }) => void>(() => {});

  const handleServerMessage = useCallback((msg: { type: string; payload: Record<string, unknown> }) => {
    switch (msg.type) {
      case "session.state": {
        const s = msg.payload.session as SessionState;
        setSessionState(s);
        if (s.activeFrameId && s.timelineFrames?.length) {
          const af = s.timelineFrames.find((f) => f.frameId === s.activeFrameId);
          if (af?.uri) {
            setActiveVariant((prev) => {
              if (prev?.variantId === af.frameId && prev?.uri === af.uri) return prev;
              return {
                variantId: af.frameId,
                uri: af.uri!,
                ordinal: af.ordinal ?? 0,
                assetId: af.assetId,
                jobId: af.jobId,
              };
            });
          }
        }
        break;
      }
      case "preview.started": {
        setIsGenerating(true);
        setLiveVariants([]);
        setLaneStatuses((p) => ({ ...p, generate: "working" }));
        break;
      }
      case "preview.partial": {
        const p = msg.payload as unknown as PreviewVariant;
        setLiveVariants((prev) => {
          const next = [...prev.filter((v) => v.variantId !== p.variantId), p];
          next.sort((a, b) => a.ordinal - b.ordinal);
          return next;
        });
        setActiveVariant(p);
        break;
      }
      case "preview.completed": {
        setIsGenerating(false);
        setLaneStatuses((p) => ({ ...p, generate: "done" }));
        setTimeout(() => setLaneStatuses((p) => ({ ...p, generate: "idle" })), 2000);
        break;
      }
      case "timeline.frame": {
        const f = msg.payload as unknown as TimelineFrame;
        if (!f.uri) break;
        setSessionState((prev) => {
          if (!prev) return prev;
          const cap = prev.frameCapacity ?? 200;
          const all = [...prev.timelineFrames.filter((tf) => tf.frameId !== f.frameId), f];
          const chronoSort = (arr: TimelineFrame[]) =>
            arr.slice().sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return ta - tb;
            });
          let trimmed: TimelineFrame[];
          if (all.length <= cap) {
            trimmed = chronoSort(all);
          } else {
            // Pinned frames always preserved; trim oldest unpinned
            const pinned = all.filter((fr) => fr.isPinned);
            const unpinned = chronoSort(all.filter((fr) => !fr.isPinned));
            const keepUnpinned = Math.max(0, cap - pinned.length);
            trimmed = chronoSort([...pinned, ...unpinned.slice(-keepUnpinned)]);
          }
          return { ...prev, timelineFrames: trimmed, activeFrameId: f.frameId };
        });
        setActiveVariant((prev) => {
          if (!prev) return { variantId: f.frameId, uri: f.uri!, ordinal: f.ordinal ?? 0, assetId: f.assetId };
          return prev;
        });
        break;
      }
      case "refine.completed": {
        const r = msg.payload as { uri: string; assetId: string };
        const refinedId = activeVariantRef.current?.variantId;
        if (refinedId) setEnhancedFrameIds((prev) => new Set([...prev, refinedId]));
        setActiveVariant((prev) => prev ? { ...prev, uri: r.uri, assetId: r.assetId } : null);
        setLaneStatuses((p) => ({ ...p, enhance: "done" }));
        setTimeout(() => setLaneStatuses((p) => ({ ...p, enhance: "idle" })), 2000);
        break;
      }
      case "upscale.completed": {
        const u = msg.payload as { uri: string; assetId: string };
        const upscaledId = activeVariantRef.current?.variantId;
        if (upscaledId) setUpscaledFrameIds((prev) => new Set([...prev, upscaledId]));
        setActiveVariant((prev) => prev ? { ...prev, uri: u.uri, assetId: u.assetId } : null);
        setLaneStatuses((p) => ({ ...p, upscale: "done" }));
        setTimeout(() => setLaneStatuses((p) => ({ ...p, upscale: "idle" })), 2000);
        break;
      }
      case "job.failed": {
        setIsGenerating(false);
        setLastError((msg.payload as { error: string }).error ?? "Job failed");
        setLaneStatuses({ generate: "error", enhance: "error", upscale: "error" });
        setTimeout(() => setLaneStatuses({ generate: "idle", enhance: "idle", upscale: "idle" }), 3000);
        break;
      }
      default:
        break;
    }
  }, []);

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  useEffect(() => {
    activeVariantRef.current = activeVariant;
  }, [activeVariant]);

  useEffect(() => {
    isMounted.current = true;
    let sid = sessionIdRef.current;
    const init = async () => {
      if (!sid) {
        try {
          setStatus("connecting");
          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!res.ok) throw new Error(`Session create failed: ${res.status}`);
          const data = await res.json();
          sid = data.session.sessionId as string;
          sessionIdRef.current = sid;
          setSessionId(sid);
        } catch (err) {
          setStatus("error");
          setLastError(err instanceof Error ? err.message : "Connection failed");
          reconnectTimer.current = setTimeout(init, reconnectDelay.current);
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_MS);
          return;
        }
      }
      connectWs(sid);
    };
    init();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connectWs]);

  const sendGenerate = useCallback((burstCount = 4, audioPositionMs: number | null = null) => {
    if (!sessionIdRef.current) return;
    send({ type: "preview.request", payload: { sessionId: sessionIdRef.current, burstCount, audioPositionMs } });
  }, [send]);

  const sendCancel = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "preview.cancel", payload: { sessionId: sessionIdRef.current, queue: "all" } });
    setIsGenerating(false);
    setLaneStatuses({ generate: "idle", enhance: "idle", upscale: "idle" });
  }, [send]);

  const sendPromptUpdate = useCallback((positive: string, negative = "") => {
    if (!sessionIdRef.current) return;
    send({
      type: "canvas.event",
      payload: {
        sessionId: sessionIdRef.current,
        event: { type: "prompt.update", positive, negative },
      },
    });
  }, [send]);

  const sendTimelineSeek = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.seek", payload: { sessionId: sessionIdRef.current, frameId } });
  }, [send]);

  const sendLoopSet = useCallback((startFrameId: string, endFrameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.loop.set", payload: { sessionId: sessionIdRef.current, startFrameId, endFrameId } });
  }, [send]);

  const sendLoopClear = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.loop.clear", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendTimelinePlay = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.play", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendTimelinePause = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.pause", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendRecordStart = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "record.start", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendRecordStop = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "record.stop", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const selectVariant = useCallback((variant: PreviewVariant) => {
    setActiveVariant(variant);
    if (sessionIdRef.current) {
      send({ type: "timeline.seek", payload: { sessionId: sessionIdRef.current, frameId: variant.variantId } });
    }
  }, [send]);

  const sendCanvasEvent = useCallback((event: CanvasEventPayload) => {
    if (!sessionIdRef.current) return;
    send({ type: "canvas.event", payload: { sessionId: sessionIdRef.current, event } });
  }, [send]);

  const requestRefine = useCallback(async () => {
    if (!sessionIdRef.current || !activeVariant) return;
    setLaneStatuses((p) => ({ ...p, enhance: "working" }));
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, variantId: activeVariant.variantId }),
      });
      if (!res.ok) throw new Error(`Refine failed: ${res.status}`);
    } catch (err) {
      setLaneStatuses((p) => ({ ...p, enhance: "error" }));
      setTimeout(() => setLaneStatuses((p) => ({ ...p, enhance: "idle" })), 3000);
      throw err;
    }
  }, [activeVariant]);

  const requestRefineByFrameId = useCallback(async (frameId: string) => {
    if (!sessionIdRef.current) return;
    setLaneStatuses((p) => ({ ...p, enhance: "working" }));
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, variantId: frameId }),
      });
      if (!res.ok) throw new Error(`Refine failed: ${res.status}`);
    } catch (err) {
      setLaneStatuses((p) => ({ ...p, enhance: "error" }));
      setTimeout(() => setLaneStatuses((p) => ({ ...p, enhance: "idle" })), 3000);
      throw err;
    }
  }, []);

  const requestUpscale = useCallback(async () => {
    if (!sessionIdRef.current || !activeVariant) return;
    setLaneStatuses((p) => ({ ...p, upscale: "working" }));
    try {
      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, assetId: activeVariant.assetId }),
      });
      if (!res.ok) throw new Error(`Upscale failed: ${res.status}`);
    } catch (err) {
      setLaneStatuses((p) => ({ ...p, upscale: "error" }));
      setTimeout(() => setLaneStatuses((p) => ({ ...p, upscale: "idle" })), 3000);
      throw err;
    }
  }, [activeVariant]);

  const deleteTimelineFrame = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    fetch("/api/timeline/delete-frame", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, frameId }),
    }).catch(() => { /* non-blocking */ });
  }, []);

  const setFrameCapacity = useCallback(async (n: number) => {
    if (!sessionIdRef.current) return;
    const cap = Math.max(10, Math.min(200, Math.round(n)));
    try {
      await fetch("/api/sessions/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, frameCapacity: cap }),
      });
      setSessionState((prev) => prev ? { ...prev, frameCapacity: cap } : prev);
    } catch { /* non-blocking */ }
  }, []);

  return {
    status, sessionId, sessionState, liveVariants, activeVariant,
    isGenerating, lastError, laneStatuses,
    enhancedFrameIds, upscaledFrameIds,
    sendGenerate, sendCancel, sendCanvasEvent, sendPromptUpdate,
    sendTimelineSeek, sendTimelinePlay, sendTimelinePause,
    sendLoopSet, sendLoopClear, deleteTimelineFrame,
    sendRecordStart, sendRecordStop,
    selectVariant,
    requestRefine, requestRefineByFrameId, requestUpscale,
    setFrameCapacity,
  };
}
