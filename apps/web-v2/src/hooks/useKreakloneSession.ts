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
  latestRecordingAssetId?: string;
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

export type PreviewFrame = {
  variantId: string;
  uri: string;
  ordinal: number;
  assetId: string;
  jobId?: string;
};

export type SessionAsset = {
  assetId: string;
  uri: string;
  kind?: string;
  mimeType?: string;
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type LaneStatus = "idle" | "working" | "done" | "error";

export type LaneStatuses = {
  generate: LaneStatus;
  enhance: LaneStatus;
  upscale: LaneStatus;
};

export type GenerateOptions = {
  audioPositionMs?: number | null;
};

export type CanvasEventPayload =
  | { type: "brush"; strokeId: string; layerId: string; size: number; points: number[] }
  | { type: "erase"; strokeId: string; layerId: string; size: number; points: number[] }
  | { type: "prompt.update"; positive: string; negative?: string }
  | { type: "region.set"; x: number; y: number; width: number; height: number }
  | { type: "image.import"; assetId: string; uri: string; x: number; y: number }
  | { type: "reference.add"; assetId: string; uri: string }
  | { type: "reference.remove"; assetId: string };

export type KreakloneSessionHook = {
  status: ConnectionStatus;
  sessionId: string | null;
  sessionState: SessionState | null;
  liveVariants: PreviewFrame[];
  liveFrames: PreviewFrame[];
  activeVariant: PreviewFrame | null;
  activeFrame: PreviewFrame | null;
  latestRefinedAsset: SessionAsset | null;
  latestUpscaledAsset: SessionAsset | null;
  latestRecordingAsset: SessionAsset | null;
  isGenerating: boolean;
  lastError: string | null;
  laneStatuses: LaneStatuses;
  sendGenerate: (frameBudget?: number, options?: GenerateOptions) => void;
  sendCancel: () => void;
  sendCanvasEvent: (event: CanvasEventPayload) => void;
  sendPromptUpdate: (positive: string, negative?: string) => void;
  sendTimelineSeek: (frameId: string) => void;
  sendTimelinePlay: () => void;
  sendTimelinePause: () => void;
  sendLoopSet: (startFrameId: string, endFrameId: string) => void;
  sendLoopClear: () => void;
  sendRecordStart: (source?: "output" | "full-session") => void;
  sendRecordStop: () => void;
  pinFrame: (frameId: string) => void;
  deleteFrame: (frameId: string) => void;
  setFrameCapacity: (n: number) => void;
  selectFrame: (frame: PreviewFrame) => void;
  selectVariant: (frame: PreviewFrame) => void;
  requestRefine: () => Promise<void>;
  requestRefineByFrameId: (frameId: string) => Promise<void>;
  requestUpscale: () => Promise<void>;
  requestUpscaleByAssetId: (assetId: string) => Promise<void>;
};

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

const MIN_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 30_000;

function queueToLane(queue: unknown): keyof LaneStatuses {
  if (queue === "refine") return "enhance";
  if (queue === "upscale") return "upscale";
  return "generate";
}

function toPreviewFrame(frame: TimelineFrame): PreviewFrame | null {
  if (!frame.uri) return null;
  return {
    variantId: frame.frameId,
    uri: frame.uri,
    ordinal: frame.ordinal ?? 0,
    assetId: frame.assetId,
    jobId: frame.jobId,
  };
}

export function useKreakloneSession(): KreakloneSessionHook {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [liveFrames, setLiveFrames] = useState<PreviewFrame[]>([]);
  const [activeFrame, setActiveFrame] = useState<PreviewFrame | null>(null);
  const [latestRefinedAsset, setLatestRefinedAsset] = useState<SessionAsset | null>(null);
  const [latestUpscaledAsset, setLatestUpscaledAsset] = useState<SessionAsset | null>(null);
  const [latestRecordingAsset, setLatestRecordingAsset] = useState<SessionAsset | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [laneStatuses, setLaneStatuses] = useState<LaneStatuses>({
    generate: "idle",
    enhance: "idle",
    upscale: "idle",
  });

  const ws = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(MIN_RECONNECT_MS);
  const isMounted = useRef(true);
  const latestRefinedAssetIdRef = useRef<string | null>(null);
  const latestUpscaledAssetIdRef = useRef<string | null>(null);
  const latestRecordingAssetIdRef = useRef<string | null>(null);

  const send = useCallback((msg: object) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const loadAsset = useCallback(async (assetId: string) => {
    const response = await fetch(`/api/assets/${assetId}`);
    if (!response.ok) {
      throw new Error(`Asset fetch failed: ${response.status}`);
    }
    const asset = await response.json();
    return {
      assetId: asset.assetId,
      uri: asset.uri,
      kind: asset.kind,
      mimeType: asset.mimeType,
    } satisfies SessionAsset;
  }, []);

  const handleServerMessageRef = useRef<(msg: { type: string; payload: Record<string, unknown> }) => void>(() => {});

  const handleServerMessage = useCallback((msg: { type: string; payload: Record<string, unknown> }) => {
    switch (msg.type) {
      case "session.state": {
        const session = msg.payload.session as SessionState;
        setSessionState(session);
        if (Array.isArray(session.timelineFrames)) {
          const nextFrames = session.timelineFrames
            .map(toPreviewFrame)
            .filter(Boolean) as PreviewFrame[];
          setLiveFrames(nextFrames);
          if (session.activeFrameId) {
            const nextActive = nextFrames.find((frame) => frame.variantId === session.activeFrameId) ?? null;
            setActiveFrame(nextActive);
          } else {
            setActiveFrame(null);
          }
        }
        const nextRecordingAssetId = session.latestRecordingAssetId ?? null;
        const nextRefinedAssetId = session.latestRefinedAssetId ?? null;
        const nextUpscaledAssetId = session.latestUpscaledAssetId ?? null;
        if (nextRefinedAssetId && nextRefinedAssetId !== latestRefinedAssetIdRef.current) {
          latestRefinedAssetIdRef.current = nextRefinedAssetId;
          loadAsset(nextRefinedAssetId)
            .then((asset) => {
              if (isMounted.current) setLatestRefinedAsset(asset);
            })
            .catch(() => {});
        } else if (!nextRefinedAssetId) {
          latestRefinedAssetIdRef.current = null;
          setLatestRefinedAsset(null);
        }
        if (nextUpscaledAssetId && nextUpscaledAssetId !== latestUpscaledAssetIdRef.current) {
          latestUpscaledAssetIdRef.current = nextUpscaledAssetId;
          loadAsset(nextUpscaledAssetId)
            .then((asset) => {
              if (isMounted.current) setLatestUpscaledAsset(asset);
            })
            .catch(() => {});
        } else if (!nextUpscaledAssetId) {
          latestUpscaledAssetIdRef.current = null;
          setLatestUpscaledAsset(null);
        }
        if (nextRecordingAssetId && nextRecordingAssetId !== latestRecordingAssetIdRef.current) {
          latestRecordingAssetIdRef.current = nextRecordingAssetId;
          loadAsset(nextRecordingAssetId)
            .then((asset) => {
              if (isMounted.current) setLatestRecordingAsset(asset);
            })
            .catch(() => {
              // ignore recording asset fetch failures in the integration lane
            });
        } else if (!nextRecordingAssetId) {
          latestRecordingAssetIdRef.current = null;
          setLatestRecordingAsset(null);
        }
        break;
      }
      case "preview.started":
        setIsGenerating(true);
        setLaneStatuses((prev) => ({ ...prev, generate: "working" }));
        break;
      case "preview.partial": {
        const payload = msg.payload as unknown as PreviewFrame;
        setLiveFrames((prev) => {
          const next = [...prev.filter((frame) => frame.variantId !== payload.variantId), payload];
          next.sort((a, b) => a.ordinal - b.ordinal);
          return next;
        });
        setActiveFrame(payload);
        break;
      }
      case "preview.completed":
        setIsGenerating(false);
        setLaneStatuses((prev) => ({ ...prev, generate: "done" }));
        setTimeout(() => setLaneStatuses((prev) => ({ ...prev, generate: "idle" })), 1500);
        break;
      case "timeline.frame": {
        const frame = toPreviewFrame(msg.payload as unknown as TimelineFrame);
        if (!frame) break;
        setLiveFrames((prev) => {
          const next = [...prev.filter((entry) => entry.variantId !== frame.variantId), frame];
          next.sort((a, b) => a.ordinal - b.ordinal);
          return next;
        });
        setActiveFrame(frame);
        break;
      }
      case "refine.completed": {
        const payload = msg.payload as { assetId: string; uri: string; sourceVariantId?: string };
        latestRefinedAssetIdRef.current = String(payload.assetId);
        setLatestRefinedAsset({
          assetId: String(payload.assetId),
          uri: String(payload.uri),
        });
        if (payload.sourceVariantId) {
          setLiveFrames((prev) => prev.map((frame) => (
            frame.variantId === payload.sourceVariantId ? { ...frame, uri: payload.uri, assetId: payload.assetId } : frame
          )));
          setActiveFrame((prev) => (
            prev && prev.variantId === payload.sourceVariantId
              ? { ...prev, uri: payload.uri, assetId: payload.assetId }
              : prev
          ));
        }
        setLaneStatuses((prev) => ({ ...prev, enhance: "done" }));
        setTimeout(() => setLaneStatuses((prev) => ({ ...prev, enhance: "idle" })), 1500);
        break;
      }
      case "upscale.completed": {
        const payload = msg.payload as { assetId: string; uri: string; sourceVariantId?: string };
        latestUpscaledAssetIdRef.current = String(payload.assetId);
        setLatestUpscaledAsset({
          assetId: String(payload.assetId),
          uri: String(payload.uri),
        });
        if (payload.sourceVariantId) {
          setLiveFrames((prev) => prev.map((frame) => (
            frame.variantId === payload.sourceVariantId ? { ...frame, uri: payload.uri, assetId: payload.assetId } : frame
          )));
          setActiveFrame((prev) => (
            prev && prev.variantId === payload.sourceVariantId
              ? { ...prev, uri: payload.uri, assetId: payload.assetId }
              : prev
          ));
        }
        setLaneStatuses((prev) => ({ ...prev, upscale: "done" }));
        setTimeout(() => setLaneStatuses((prev) => ({ ...prev, upscale: "idle" })), 1500);
        break;
      }
      case "record.completed":
        latestRecordingAssetIdRef.current = String(msg.payload.assetId);
        setLatestRecordingAsset({
          assetId: String(msg.payload.assetId),
          uri: String(msg.payload.uri),
        });
        setLastError(null);
        break;
      case "job.failed":
        {
          const queue = (msg.payload as { queue?: string }).queue;
          const lane = queueToLane(queue);
          if (lane === "generate") {
            setIsGenerating(false);
          }
          setLastError((msg.payload as { error?: string }).error ?? "Job failed");
          setLaneStatuses((prev) => ({
            ...prev,
            [lane]: "error",
          }));
        }
        break;
      default:
        break;
    }
  }, [loadAsset]);

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

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
      } catch {
        // ignore invalid packets in adapter hook
      }
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
            body: JSON.stringify({})
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

  const sendGenerate = useCallback((frameBudget = 4, options: GenerateOptions = {}) => {
    if (!sessionIdRef.current) return;
    send({
      type: "preview.request",
      payload: {
        sessionId: sessionIdRef.current,
        burstCount: frameBudget,
        ...(typeof options.audioPositionMs === "number" ? { audioPositionMs: options.audioPositionMs } : {}),
      }
    });
  }, [send]);

  const sendCancel = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "preview.cancel", payload: { sessionId: sessionIdRef.current, queue: "all" } });
    setIsGenerating(false);
    setLaneStatuses({ generate: "idle", enhance: "idle", upscale: "idle" });
  }, [send]);

  const sendCanvasEvent = useCallback((event: CanvasEventPayload) => {
    if (!sessionIdRef.current) return;
    send({ type: "canvas.event", payload: { sessionId: sessionIdRef.current, event } });
  }, [send]);

  const sendPromptUpdate = useCallback((positive: string, negative = "") => {
    sendCanvasEvent({ type: "prompt.update", positive, negative });
  }, [sendCanvasEvent]);

  const sendTimelineSeek = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.seek", payload: { sessionId: sessionIdRef.current, frameId } });
  }, [send]);

  const sendTimelinePlay = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.play", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendTimelinePause = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.pause", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendLoopSet = useCallback((startFrameId: string, endFrameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.loop.set", payload: { sessionId: sessionIdRef.current, startFrameId, endFrameId } });
  }, [send]);

  const sendLoopClear = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.loop.clear", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const sendRecordStart = useCallback((source: "output" | "full-session" = "output") => {
    if (!sessionIdRef.current) return;
    send({ type: "record.start", payload: { sessionId: sessionIdRef.current, source } });
  }, [send]);

  const sendRecordStop = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "record.stop", payload: { sessionId: sessionIdRef.current } });
  }, [send]);

  const pinFrame = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.pin", payload: { sessionId: sessionIdRef.current, frameId } });
  }, [send]);

  const deleteFrame = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.delete", payload: { sessionId: sessionIdRef.current, frameId } });
  }, [send]);

  const setFrameCapacity = useCallback((n: number) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.capacity.set", payload: { sessionId: sessionIdRef.current, frameCapacity: n } });
  }, [send]);

  const selectFrame = useCallback((frame: PreviewFrame) => {
    setActiveFrame(frame);
    sendTimelineSeek(frame.variantId);
  }, [sendTimelineSeek]);

  const requestRefineByFrameId = useCallback(async (frameId: string) => {
    if (!sessionIdRef.current) return;
    setLaneStatuses((prev) => ({ ...prev, enhance: "working" }));
    const res = await fetch("/api/refine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, variantId: frameId })
    });
    if (!res.ok) throw new Error(`Refine failed: ${res.status}`);
  }, []);

  const requestRefine = useCallback(async () => {
    if (!activeFrame) return;
    await requestRefineByFrameId(activeFrame.variantId);
  }, [activeFrame, requestRefineByFrameId]);

  const requestUpscaleByAssetId = useCallback(async (assetId: string) => {
    if (!sessionIdRef.current) return;
    setLaneStatuses((prev) => ({ ...prev, upscale: "working" }));
    const res = await fetch("/api/upscale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, assetId })
    });
    if (!res.ok) throw new Error(`Upscale failed: ${res.status}`);
  }, []);

  const requestUpscale = useCallback(async () => {
    if (!activeFrame) return;
    await requestUpscaleByAssetId(activeFrame.assetId);
  }, [activeFrame, requestUpscaleByAssetId]);

  return {
    status,
    sessionId,
    sessionState,
    liveVariants: liveFrames,
    liveFrames,
    activeVariant: activeFrame,
    activeFrame,
    latestRefinedAsset,
    latestUpscaledAsset,
    latestRecordingAsset,
    isGenerating,
    lastError,
    laneStatuses,
    sendGenerate,
    sendCancel,
    sendCanvasEvent,
    sendPromptUpdate,
    sendTimelineSeek,
    sendTimelinePlay,
    sendTimelinePause,
    sendLoopSet,
    sendLoopClear,
    sendRecordStart,
    sendRecordStop,
    pinFrame,
    deleteFrame,
    setFrameCapacity,
    selectFrame,
    selectVariant: selectFrame,
    requestRefine,
    requestRefineByFrameId,
    requestUpscale,
    requestUpscaleByAssetId,
  };
}
