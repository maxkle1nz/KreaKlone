import { useCallback, useEffect, useRef, useState } from "react";
import type { TimelineFrame, SessionState } from "./useYlimitSession";

/* ── Types ── */
export type TransitionType =
  | "cut"
  | "fade"
  | "cross-dissolve"
  | "wipe-right"
  | "zoom-in"
  | "zoom-out";

export type Transition = {
  type: TransitionType;
  durationMs: number;
};

export type BlockFrame = {
  frameId: string;
  uri: string | undefined;
  createdAt: string | undefined;
};

export type Block = {
  id: string;
  name: string;
  sessionId: string;
  startFrameId: string;
  endFrameId: string;
  frames: BlockFrame[];
  thumbnail: string | undefined;
  durationMs: number;
  frameCount: number;
  createdAt: string;
};

export type CompositionItem = {
  itemId: string;
  blockId: string;
  trimStart: number;
  trimEnd: number;
  transitionAfter: Transition | null;
};

export type ExportSettings = {
  resolution: "720p" | "1080p" | "4k";
  fps: 24 | 30 | 60;
  format: "mp4" | "webm";
};

export type CompositionDefaults = {
  defaultTransition: TransitionType;
  defaultTransitionDuration: number;
  defaultResolution: "720p" | "1080p" | "4k";
  defaultFps: 24 | 30 | 60;
  defaultFormat: "mp4" | "webm";
  framesPerBeat: number;
};

export type BlockComposerHook = {
  blocks: Block[];
  composition: CompositionItem[];
  exportSettings: ExportSettings;
  setExportSettings: (s: ExportSettings) => void;
  compositionDefaults: CompositionDefaults;
  setCompositionDefaults: (d: CompositionDefaults) => void;
  canCreateBlock: boolean;
  createBlock: (name: string) => Block | null;
  createBlockFromFrames: (name: string, frameIds: string[]) => Block | null;
  deleteBlock: (blockId: string) => void;
  renameBlock: (blockId: string, name: string) => void;
  addToArranger: (blockId: string, defaults?: { type: TransitionType; durationMs: number }) => void;
  removeFromArranger: (itemId: string) => void;
  reorderArranger: (fromIdx: number, toIdx: number) => void;
  setTransition: (itemIdx: number, t: Transition | null) => void;
  trimItem: (itemId: string, trimStart: number, trimEnd: number) => void;
  resolveItemFrames: (item: CompositionItem) => BlockFrame[];
  totalDurationMs: number;
};

/* ── Helpers ── */
function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function lsKey(sessionId: string) {
  return `ylimit_blocks_${sessionId}`;
}

export function defaultCompositionDefaults(): CompositionDefaults {
  return {
    defaultTransition: "cut",
    defaultTransitionDuration: 500,
    defaultResolution: "720p",
    defaultFps: 30,
    defaultFormat: "mp4",
    framesPerBeat: 4,
  };
}

function loadFromStorage(sessionId: string): { blocks: Block[]; composition: CompositionItem[]; exportSettings: ExportSettings; compositionDefaults: CompositionDefaults } {
  try {
    const raw = localStorage.getItem(lsKey(sessionId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const compDefaults: CompositionDefaults = parsed.compositionDefaults ?? defaultCompositionDefaults();
    /* Seed exportSettings from compositionDefaults on first use (no saved exportSettings).
       Subsequent user edits to exportSettings are preserved independently. */
    const exportSettings: ExportSettings = parsed.exportSettings ?? {
      resolution: compDefaults.defaultResolution,
      fps: compDefaults.defaultFps,
      format: compDefaults.defaultFormat,
    };
    return {
      blocks: parsed.blocks ?? [],
      composition: parsed.composition ?? [],
      exportSettings,
      compositionDefaults: compDefaults,
    };
  } catch {
    return defaultState();
  }
}

function defaultExportSettings(): ExportSettings {
  return { resolution: "720p", fps: 30, format: "mp4" };
}

function defaultState() {
  return { blocks: [], composition: [], exportSettings: defaultExportSettings(), compositionDefaults: defaultCompositionDefaults() };
}

function saveToStorage(sessionId: string, state: { blocks: Block[]; composition: CompositionItem[]; exportSettings: ExportSettings; compositionDefaults: CompositionDefaults }) {
  try {
    localStorage.setItem(lsKey(sessionId), JSON.stringify(state));
  } catch { /* storage full or unavailable */ }
}

/* ── Extract frames between two frameIds (inclusive) ── */
function extractFrameRange(
  allFrames: TimelineFrame[],
  startFrameId: string,
  endFrameId: string
): BlockFrame[] {
  const startIdx = allFrames.findIndex((f) => f.frameId === startFrameId);
  const endIdx = allFrames.findIndex((f) => f.frameId === endFrameId);
  if (startIdx === -1 || endIdx === -1) return [];
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  return allFrames.slice(lo, hi + 1).map((f) => ({
    frameId: f.frameId,
    uri: f.uri,
    createdAt: f.createdAt,
  }));
}

function computeDuration(frames: BlockFrame[]): number {
  if (frames.length < 2) return 0;
  const first = frames.find((f) => f.createdAt);
  const last = [...frames].reverse().find((f) => f.createdAt);
  if (!first || !last || first === last) return 0;
  return new Date(last.createdAt!).getTime() - new Date(first.createdAt!).getTime();
}

/* ── Hook ── */
export function useBlockComposer(
  sessionId: string | null,
  sessionState: SessionState | null
): BlockComposerHook {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [composition, setComposition] = useState<CompositionItem[]>([]);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(defaultExportSettings());
  const [compositionDefaults, setCompositionDefaults] = useState<CompositionDefaults>(defaultCompositionDefaults());

  const initialized = useRef(false);

  /* Load from localStorage when sessionId is available */
  useEffect(() => {
    if (!sessionId) return;
    initialized.current = false;
    const stored = loadFromStorage(sessionId);
    setBlocks(stored.blocks);
    setComposition(stored.composition);
    setExportSettings(stored.exportSettings);
    setCompositionDefaults(stored.compositionDefaults);
    initialized.current = true;
  }, [sessionId]);

  /* Persist on every change */
  useEffect(() => {
    if (!sessionId || !initialized.current) return;
    saveToStorage(sessionId, { blocks, composition, exportSettings, compositionDefaults });
  }, [sessionId, blocks, composition, exportSettings, compositionDefaults]);

  const loopRange = sessionState?.loopRange;
  const allFrames = sessionState?.timelineFrames ?? [];

  const canCreateBlock = !!(loopRange?.startFrameId && loopRange?.endFrameId);

  const createBlock = useCallback((name: string): Block | null => {
    if (!sessionId || !loopRange) return null;
    const frames = extractFrameRange(allFrames, loopRange.startFrameId, loopRange.endFrameId);
    if (frames.length === 0) return null;
    const thumbnail = frames.find((f) => f.uri)?.uri ?? frames[0]?.uri;
    const block: Block = {
      id: makeId(),
      name: name.trim() || `Block ${Date.now()}`,
      sessionId,
      startFrameId: loopRange.startFrameId,
      endFrameId: loopRange.endFrameId,
      frames,
      thumbnail,
      durationMs: computeDuration(frames),
      frameCount: frames.length,
      createdAt: new Date().toISOString(),
    };
    setBlocks((prev) => [...prev, block]);
    return block;
  }, [sessionId, loopRange, allFrames]);

  /* Create a block from an explicit ordered list of frameIds (for section clip export) */
  const createBlockFromFrames = useCallback((name: string, frameIds: string[]): Block | null => {
    if (!sessionId || frameIds.length === 0) return null;
    const frameMap = new Map(allFrames.map((f) => [f.frameId, f]));
    const orderedFrames: BlockFrame[] = frameIds
      .map((id) => frameMap.get(id))
      .filter((f): f is TimelineFrame => f !== undefined)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((f) => ({ frameId: f.frameId, uri: f.uri, createdAt: f.createdAt }));
    if (orderedFrames.length === 0) return null;
    const thumbnail = orderedFrames.find((f) => f.uri)?.uri;
    const block: Block = {
      id: makeId(),
      name: name.trim() || `Section Block ${Date.now()}`,
      sessionId,
      startFrameId: orderedFrames[0].frameId,
      endFrameId: orderedFrames[orderedFrames.length - 1].frameId,
      frames: orderedFrames,
      thumbnail,
      durationMs: computeDuration(orderedFrames),
      frameCount: orderedFrames.length,
      createdAt: new Date().toISOString(),
    };
    setBlocks((prev) => [...prev, block]);
    return block;
  }, [sessionId, allFrames]);

  const deleteBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    /* When removing a block, remove its arranger items and fix transitions */
    setComposition((prev) => {
      const next = prev.filter((item) => item.blockId !== blockId);
      return normalizeTransitions(next);
    });
  }, []);

  const renameBlock = useCallback((blockId: string, name: string) => {
    setBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, name } : b));
  }, []);

  /* ── Transition is on the PREVIOUS item (item[i] → item[i+1]).
     The NEW item appended is always the last, so it gets transitionAfter=null.
     The previously-last item gets a default transition assigned if it had none. ── */
  const addToArranger = useCallback((blockId: string, defaults?: { type: TransitionType; durationMs: number }) => {
    setComposition((prev) => {
      const newItem: CompositionItem = {
        itemId: makeId(),
        blockId,
        trimStart: 0,
        trimEnd: 0,
        transitionAfter: null, // last item always has null
      };
      if (prev.length === 0) return [newItem];
      /* Give the currently-last item a default transition (it's no longer last) */
      const defTrans = defaults ?? { type: "cut" as TransitionType, durationMs: 0 };
      const updated = prev.map((item, idx) =>
        idx === prev.length - 1 && item.transitionAfter === null
          ? { ...item, transitionAfter: defTrans }
          : item
      );
      return [...updated, newItem];
    });
  }, []);

  const removeFromArranger = useCallback((itemId: string) => {
    setComposition((prev) => {
      const next = prev.filter((item) => item.itemId !== itemId);
      return normalizeTransitions(next);
    });
  }, []);

  const reorderArranger = useCallback((fromIdx: number, toIdx: number) => {
    setComposition((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return normalizeTransitions(next);
    });
  }, []);

  const setTransition = useCallback((itemIdx: number, t: Transition | null) => {
    setComposition((prev) => {
      if (itemIdx < 0 || itemIdx >= prev.length - 1) return prev; // last item can't have a transition
      const next = [...prev];
      next[itemIdx] = { ...next[itemIdx], transitionAfter: t };
      return next;
    });
  }, []);

  const trimItem = useCallback((itemId: string, trimStart: number, trimEnd: number) => {
    setComposition((prev) =>
      prev.map((item) => {
        if (item.itemId !== itemId) return item;
        const block = blocks.find((b) => b.id === item.blockId);
        const maxTrimEach = block ? Math.max(0, Math.floor(block.frameCount / 2) - 1) : 0;
        return {
          ...item,
          trimStart: Math.max(0, Math.min(maxTrimEach, trimStart)),
          trimEnd: Math.max(0, Math.min(maxTrimEach, trimEnd)),
        };
      })
    );
  }, [blocks]);

  const resolveItemFrames = useCallback((item: CompositionItem): BlockFrame[] => {
    const block = blocks.find((b) => b.id === item.blockId);
    if (!block) return [];
    const endSlice = block.frames.length - item.trimEnd;
    return block.frames.slice(item.trimStart, endSlice > item.trimStart ? endSlice : undefined);
  }, [blocks]);

  const totalDurationMs = composition.reduce((acc, item) => {
    const block = blocks.find((b) => b.id === item.blockId);
    if (!block) return acc;
    const frameCount = Math.max(1, block.frameCount - item.trimStart - item.trimEnd);
    const durPerFrame = block.frameCount > 1 ? block.durationMs / (block.frameCount - 1) : 0;
    return acc + frameCount * durPerFrame + (item.transitionAfter?.durationMs ?? 0);
  }, 0);

  return {
    blocks,
    composition,
    exportSettings,
    setExportSettings,
    compositionDefaults,
    setCompositionDefaults,
    canCreateBlock,
    createBlock,
    createBlockFromFrames,
    deleteBlock,
    renameBlock,
    addToArranger,
    removeFromArranger,
    reorderArranger,
    setTransition,
    trimItem,
    resolveItemFrames,
    totalDurationMs,
  };
}

/* ── Ensure only the last item has transitionAfter=null; all others have one ── */
function normalizeTransitions(items: CompositionItem[]): CompositionItem[] {
  if (items.length === 0) return items;
  return items.map((item, i) => {
    if (i === items.length - 1) {
      return { ...item, transitionAfter: null };
    }
    if (item.transitionAfter === null) {
      return { ...item, transitionAfter: { type: "cut" as TransitionType, durationMs: 0 } };
    }
    return item;
  });
}
