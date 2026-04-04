import { randomUUID } from "node:crypto";
import { clampBurstCount } from "./contracts.js";

export const DEFAULT_ROI = Object.freeze({ x: 0, y: 0, width: 1024, height: 1024 });

export function createJobId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function createPreviewJob(sessionState, options = {}) {
  return {
    jobId: createJobId("preview"),
    queue: "preview",
    sessionId: sessionState.sessionId,
    sessionVersion: sessionState.version,
    roi: sessionState.activeRoi ?? DEFAULT_ROI,
    prompt: sessionState.prompt,
    references: sessionState.references,
    burstCount: clampBurstCount(options.burstCount, 4),
    audioPositionMs: options.audioPositionMs ?? null,
    seedMode: options.seedMode ?? "increment",
    previewModel: options.previewModel ?? "sdxl-turbo",
    priority: 100,
    createdAt: new Date().toISOString()
  };
}

export function createRefineJob(sessionState, sourceVariantId, options = {}) {
  return {
    jobId: createJobId("refine"),
    queue: "refine",
    sessionId: sessionState.sessionId,
    sessionVersion: sessionState.version,
    sourceVariantId,
    roi: sessionState.activeRoi ?? DEFAULT_ROI,
    prompt: sessionState.prompt,
    references: sessionState.references,
    refineModel: options.refineModel ?? "qwen-image-edit",
    priority: 50,
    createdAt: new Date().toISOString()
  };
}

export function createUpscaleJob(sessionState, sourceImageId, options = {}) {
  return {
    jobId: createJobId("upscale"),
    queue: "upscale",
    sessionId: sessionState.sessionId,
    sessionVersion: sessionState.version,
    sourceImageId,
    targetLongEdge: options.targetLongEdge ?? 2048,
    mode: options.mode ?? "high-detail",
    priority: 10,
    createdAt: new Date().toISOString(),
    selectedVariantId: sessionState.activeFrameId ?? sessionState.selectedVariantId
  };
}
