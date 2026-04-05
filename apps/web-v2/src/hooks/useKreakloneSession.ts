import { useEffect, useRef, useCallback, useState } from "react";
import { appendPendingClientMessage, replacePendingClientMessages } from "../../../../packages/shared/src/pending-client-messages.js";

export type SessionState = {
  sessionId: string;
  version: number;
  prompt: { positive: string; negative: string };
  timelineFrames: TimelineFrame[];
  activeFrameId?: string;
  loopRange?: { startFrameId: string; endFrameId: string };
  playback?: { isPlaying?: boolean };
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
  frameId?: string;
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

type ClientMessage = {
  type: string;
  payload: Record<string, unknown>;
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
const MAX_PENDING_CLIENT_MESSAGES = 100;

function queueToLane(queue: unknown): keyof LaneStatuses {
  if (queue === "refine") return "enhance";
  if (queue === "upscale") return "upscale";
  return "generate";
}

function resolvePreviewFrameIdentity(payload: { frameId?: unknown; variantId?: unknown }): { frameId?: string; variantId: string } | null {
  const frameId = typeof payload.frameId === "string" && payload.frameId.length > 0 ? payload.frameId : undefined;
  const variantId = typeof payload.variantId === "string" && payload.variantId.length > 0 ? payload.variantId : frameId;
  if (!variantId) return null;
  return { frameId, variantId };
}

function normalizePreviewFrame(
  frame: Partial<TimelineFrame> & Partial<PreviewFrame> & { variantId?: string }
): PreviewFrame | null {
  if (typeof frame.uri !== "string" || frame.uri.length === 0) return null;
  if (typeof frame.assetId !== "string" || frame.assetId.length === 0) return null;
  const identity = resolvePreviewFrameIdentity(frame);
  if (!identity) return null;
  const ordinal = Number.isInteger(frame.ordinal) ? Number(frame.ordinal) : 0;
  return {
    frameId: identity.frameId,
    variantId: identity.variantId,
    uri: frame.uri,
    ordinal,
    assetId: frame.assetId,
    jobId: typeof frame.jobId === "string" ? frame.jobId : undefined,
  };
}

function previewFrameKey(frame: Pick<PreviewFrame, "frameId" | "variantId">): string {
  return frame.frameId ?? frame.variantId;
}

function matchesPreviewFrame(frame: Pick<PreviewFrame, "frameId" | "variantId">, targetId: string): boolean {
  return frame.frameId === targetId || frame.variantId === targetId;
}

function upsertPreviewFrame(frames: PreviewFrame[], nextFrame: PreviewFrame): PreviewFrame[] {
  const next = [
    ...frames.filter((frame) => (
      previewFrameKey(frame) !== previewFrameKey(nextFrame)
      && frame.variantId !== nextFrame.variantId
      && !(frame.frameId && nextFrame.frameId && frame.frameId === nextFrame.frameId)
    )),
    nextFrame,
  ];
  next.sort((a, b) => a.ordinal - b.ordinal);
  return next;
}

function getFrameTargetId(frame: Pick<PreviewFrame, "frameId" | "variantId">): string {
  return frame.frameId ?? frame.variantId;
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
  const pendingClientMessagesRef = useRef<ClientMessage[]>([]);

  const enqueuePendingMessage = useCallback((message: ClientMessage) => {
    const queued = appendPendingClientMessage(pendingClientMessagesRef.current, message);
    if (queued.length > MAX_PENDING_CLIENT_MESSAGES) {
      pendingClientMessagesRef.current = queued.slice(-MAX_PENDING_CLIENT_MESSAGES);
      setLastError(`Connection interrupted — replaying latest ${MAX_PENDING_CLIENT_MESSAGES} actions`);
      return;
    }
    pendingClientMessagesRef.current = queued;
  }, []);

  const flushPendingMessages = useCallback((socket: WebSocket) => {
    if (pendingClientMessagesRef.current.length === 0) {
      return;
    }
    const queued = pendingClientMessagesRef.current;
    pendingClientMessagesRef.current = [];
    queued.forEach((message) => {
      socket.send(JSON.stringify(message));
    });
  }, []);

  const send = useCallback((msg: ClientMessage, options: { queueIfDisconnected?: boolean } = {}) => {
    const socket = ws.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
      return true;
    }
    if (options.queueIfDisconnected !== false && sessionIdRef.current) {
      enqueuePendingMessage(msg);
      setStatus("connecting");
      setLastError((prev) => prev ?? "Connection interrupted — reconnecting…");
    }
    return false;
  }, [enqueuePendingMessage]);

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
  const markLaneError = useCallback((lane: keyof LaneStatuses, error: unknown) => {
    const message = error instanceof Error ? error.message : "Request failed";
    setLastError(message);
    setLaneStatuses((prev) => ({
      ...prev,
      [lane]: "error",
    }));
  }, []);
  const hydrateLatestAsset = useCallback(({
    assetId,
    assetIdRef,
    setAsset,
    errorLabel,
    lane,
  }: {
    assetId: string;
    assetIdRef: { current: string | null };
    setAsset: (asset: SessionAsset | null) => void;
    errorLabel: string;
    lane?: keyof LaneStatuses;
  }) => {
    assetIdRef.current = assetId;
    loadAsset(assetId)
      .then((asset) => {
        if (!isMounted.current || assetIdRef.current !== assetId) return;
        setAsset(asset);
      })
      .catch((error) => {
        if (!isMounted.current || assetIdRef.current !== assetId) return;
        setAsset(null);
        if (lane) {
          setLaneStatuses((prev) => ({
            ...prev,
            [lane]: "error",
          }));
        }
        const message = error instanceof Error ? error.message : "Asset fetch failed";
        setLastError(`${errorLabel}: ${message}`);
      });
  }, [loadAsset]);

  const handleServerMessage = useCallback((msg: { type: string; payload: Record<string, unknown> }) => {
    switch (msg.type) {
      case "session.state": {
        const session = msg.payload.session as SessionState;
        setSessionState(session);
        if (Array.isArray(session.timelineFrames)) {
          const nextFrames = session.timelineFrames
            .map(normalizePreviewFrame)
            .filter(Boolean) as PreviewFrame[];
          setLiveFrames(nextFrames);
          const activeFrameId = session.activeFrameId;
          if (activeFrameId) {
            const nextActive = nextFrames.find((frame) => matchesPreviewFrame(frame, activeFrameId)) ?? null;
            setActiveFrame(nextActive);
          } else {
            setActiveFrame(null);
          }
        }
        const nextRecordingAssetId = session.latestRecordingAssetId ?? null;
        const nextRefinedAssetId = session.latestRefinedAssetId ?? null;
        const nextUpscaledAssetId = session.latestUpscaledAssetId ?? null;
        if (nextRefinedAssetId && nextRefinedAssetId !== latestRefinedAssetIdRef.current) {
          hydrateLatestAsset({
            assetId: nextRefinedAssetId,
            assetIdRef: latestRefinedAssetIdRef,
            setAsset: setLatestRefinedAsset,
            errorLabel: "Failed to reload refine asset",
            lane: "enhance",
          });
        } else if (!nextRefinedAssetId) {
          latestRefinedAssetIdRef.current = null;
          setLatestRefinedAsset(null);
        }
        if (nextUpscaledAssetId && nextUpscaledAssetId !== latestUpscaledAssetIdRef.current) {
          hydrateLatestAsset({
            assetId: nextUpscaledAssetId,
            assetIdRef: latestUpscaledAssetIdRef,
            setAsset: setLatestUpscaledAsset,
            errorLabel: "Failed to reload upscale asset",
            lane: "upscale",
          });
        } else if (!nextUpscaledAssetId) {
          latestUpscaledAssetIdRef.current = null;
          setLatestUpscaledAsset(null);
        }
        if (nextRecordingAssetId && nextRecordingAssetId !== latestRecordingAssetIdRef.current) {
          hydrateLatestAsset({
            assetId: nextRecordingAssetId,
            assetIdRef: latestRecordingAssetIdRef,
            setAsset: setLatestRecordingAsset,
            errorLabel: "Failed to reload recording asset",
          });
        } else if (!nextRecordingAssetId) {
          latestRecordingAssetIdRef.current = null;
          setLatestRecordingAsset(null);
        }
        break;
      }
      case "preview.started":
        setLastError(null);
        setIsGenerating(true);
        setLaneStatuses((prev) => ({ ...prev, generate: "working" }));
        break;
      case "preview.partial": {
        const payload = normalizePreviewFrame(msg.payload as Partial<TimelineFrame> & Partial<PreviewFrame> & { variantId?: string });
        if (!payload) break;
        setLiveFrames((prev) => {
          return upsertPreviewFrame(prev, payload);
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
        const frame = normalizePreviewFrame(msg.payload as Partial<TimelineFrame> & Partial<PreviewFrame> & { variantId?: string });
        if (!frame) break;
        setLiveFrames((prev) => {
          return upsertPreviewFrame(prev, frame);
        });
        setActiveFrame(frame);
        break;
      }
      case "refine.completed": {
        const payload = msg.payload as { assetId: string; uri: string; sourceVariantId?: string };
        setLastError(null);
        latestRefinedAssetIdRef.current = String(payload.assetId);
        setLatestRefinedAsset({
          assetId: String(payload.assetId),
          uri: String(payload.uri),
        });
        const sourceVariantId = payload.sourceVariantId;
        if (typeof sourceVariantId === "string" && sourceVariantId.length > 0) {
          setLiveFrames((prev) => prev.map((frame) => (
            matchesPreviewFrame(frame, sourceVariantId)
              ? { ...frame, uri: payload.uri, assetId: payload.assetId }
              : frame
          )));
          setActiveFrame((prev) => (
            prev && matchesPreviewFrame(prev, sourceVariantId)
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
        setLastError(null);
        latestUpscaledAssetIdRef.current = String(payload.assetId);
        setLatestUpscaledAsset({
          assetId: String(payload.assetId),
          uri: String(payload.uri),
        });
        const sourceVariantId = payload.sourceVariantId;
        if (typeof sourceVariantId === "string" && sourceVariantId.length > 0) {
          setLiveFrames((prev) => prev.map((frame) => (
            matchesPreviewFrame(frame, sourceVariantId)
              ? { ...frame, uri: payload.uri, assetId: payload.assetId }
              : frame
          )));
          setActiveFrame((prev) => (
            prev && matchesPreviewFrame(prev, sourceVariantId)
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
  }, [hydrateLatestAsset]);

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  const connectWs = useCallback((sid: string) => {
    if (!isMounted.current) return;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    setStatus("connecting");
    const socket = new WebSocket(buildWsUrl());
    ws.current = socket;

    socket.onopen = () => {
      if (!isMounted.current) return;
      reconnectDelay.current = MIN_RECONNECT_MS;
      setStatus("connected");
      setLastError(null);
      socket.send(JSON.stringify({ type: "session.join", payload: { sessionId: sid } satisfies ClientMessage["payload"] }));
      flushPendingMessages(socket);
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
      setStatus("connecting");
      setLastError((prev) => prev ?? "Connection lost — reconnecting…");
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
      pendingClientMessagesRef.current = [];
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
      },
    }, { queueIfDisconnected: true });
  }, [send]);

  const sendCancel = useCallback(() => {
    if (!sessionIdRef.current) return;
    const cancelMessage = { type: "preview.cancel", payload: { sessionId: sessionIdRef.current, queue: "all" } } satisfies ClientMessage;
    const socket = ws.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      pendingClientMessagesRef.current = [];
      socket.send(JSON.stringify(cancelMessage));
    } else {
      pendingClientMessagesRef.current = replacePendingClientMessages(cancelMessage);
      setStatus("connecting");
    }
    setIsGenerating(false);
    setLastError(null);
    setLaneStatuses({ generate: "idle", enhance: "idle", upscale: "idle" });
  }, []);

  const sendCanvasEvent = useCallback((event: CanvasEventPayload) => {
    if (!sessionIdRef.current) return;
    send({ type: "canvas.event", payload: { sessionId: sessionIdRef.current, event } }, { queueIfDisconnected: true });
  }, [send]);

  const sendPromptUpdate = useCallback((positive: string, negative = "") => {
    sendCanvasEvent({ type: "prompt.update", positive, negative });
  }, [sendCanvasEvent]);

  const sendTimelineSeek = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.seek", payload: { sessionId: sessionIdRef.current, frameId } }, { queueIfDisconnected: true });
  }, [send]);

  const sendTimelinePlay = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.play", payload: { sessionId: sessionIdRef.current } }, { queueIfDisconnected: true });
  }, [send]);

  const sendTimelinePause = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.pause", payload: { sessionId: sessionIdRef.current } }, { queueIfDisconnected: true });
  }, [send]);

  const sendLoopSet = useCallback((startFrameId: string, endFrameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.loop.set", payload: { sessionId: sessionIdRef.current, startFrameId, endFrameId } }, { queueIfDisconnected: true });
  }, [send]);

  const sendLoopClear = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.loop.clear", payload: { sessionId: sessionIdRef.current } }, { queueIfDisconnected: true });
  }, [send]);

  const sendRecordStart = useCallback((source: "output" | "full-session" = "output") => {
    if (!sessionIdRef.current) return;
    send({ type: "record.start", payload: { sessionId: sessionIdRef.current, source } }, { queueIfDisconnected: true });
  }, [send]);

  const sendRecordStop = useCallback(() => {
    if (!sessionIdRef.current) return;
    send({ type: "record.stop", payload: { sessionId: sessionIdRef.current } }, { queueIfDisconnected: true });
  }, [send]);

  const pinFrame = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.pin", payload: { sessionId: sessionIdRef.current, frameId } }, { queueIfDisconnected: true });
  }, [send]);

  const deleteFrame = useCallback((frameId: string) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.delete", payload: { sessionId: sessionIdRef.current, frameId } }, { queueIfDisconnected: true });
  }, [send]);

  const setFrameCapacity = useCallback((n: number) => {
    if (!sessionIdRef.current) return;
    send({ type: "timeline.capacity.set", payload: { sessionId: sessionIdRef.current, frameCapacity: n } }, { queueIfDisconnected: true });
  }, [send]);

  const selectFrame = useCallback((frame: PreviewFrame) => {
    setActiveFrame(frame);
    sendTimelineSeek(getFrameTargetId(frame));
  }, [sendTimelineSeek]);

  const requestRefineByFrameId = useCallback(async (frameId: string) => {
    if (!sessionIdRef.current) return;
    setLastError(null);
    setLaneStatuses((prev) => ({ ...prev, enhance: "working" }));
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, frameId })
      });
      if (!res.ok) throw new Error(`Refine failed: ${res.status}`);
    } catch (error) {
      markLaneError("enhance", error);
      throw error;
    }
  }, [markLaneError]);

  const requestRefine = useCallback(async () => {
    if (!activeFrame) return;
    await requestRefineByFrameId(getFrameTargetId(activeFrame));
  }, [activeFrame, requestRefineByFrameId]);

  const requestUpscaleByAssetId = useCallback(async (assetId: string) => {
    if (!sessionIdRef.current) return;
    setLastError(null);
    setLaneStatuses((prev) => ({ ...prev, upscale: "working" }));
    try {
      const res = await fetch("/api/upscale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, assetId })
      });
      if (!res.ok) throw new Error(`Upscale failed: ${res.status}`);
    } catch (error) {
      markLaneError("upscale", error);
      throw error;
    }
  }, [markLaneError]);

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
