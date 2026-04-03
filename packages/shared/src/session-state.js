import { randomUUID } from "node:crypto";
import { deriveRoiForCanvasEvent } from "./roi.js";
import { validateCanvasEvent } from "./contracts.js";

function dedupe(values) {
  return [...new Set(values)];
}

export function createSessionState(sessionId = `session_${randomUUID()}`) {
  return {
    sessionId,
    version: 0,
    layers: [{ id: "base", assetId: undefined, visible: true }],
    masks: [],
    prompt: { positive: "", negative: "" },
    references: [],
    activeRoi: undefined,
    seedHistory: [],
    selectedVariantId: undefined,
    latestRefinedAssetId: undefined,
    latestUpscaledAssetId: undefined,
    lastEventType: undefined,
    updatedAt: new Date().toISOString(),
    importedAssetId: undefined,
    strokes: []
  };
}

export function applyCanvasEvent(state, canvasEvent) {
  validateCanvasEvent(canvasEvent);
  const nextState = {
    ...state,
    version: state.version + 1,
    prompt: { ...state.prompt },
    layers: [...state.layers],
    masks: [...state.masks],
    references: [...state.references],
    strokes: [...state.strokes],
    selectedVariantId: undefined,
    updatedAt: new Date().toISOString(),
    lastEventType: canvasEvent.type
  };

  switch (canvasEvent.type) {
    case "prompt.update":
      nextState.prompt.positive = canvasEvent.positive;
      nextState.prompt.negative = canvasEvent.negative ?? "";
      break;
    case "reference.add":
      nextState.references = dedupe([...state.references, canvasEvent.assetId]);
      break;
    case "reference.remove":
      nextState.references = state.references.filter((assetId) => assetId !== canvasEvent.assetId);
      break;
    case "region.set":
      break;
    case "image.import": {
      nextState.importedAssetId = canvasEvent.assetId;
      nextState.layers = state.layers.some((layer) => layer.id === "base")
        ? state.layers.map((layer) => (layer.id === "base" ? { ...layer, assetId: canvasEvent.assetId } : layer))
        : [...state.layers, { id: "base", assetId: canvasEvent.assetId, visible: true }];
      break;
    }
    case "mask.update":
      nextState.masks = dedupe([...state.masks, canvasEvent.maskId]).map((maskId) => ({ id: maskId }));
      break;
    case "brush":
    case "erase":
      nextState.strokes = [
        ...state.strokes.slice(-24),
        {
          strokeId: canvasEvent.strokeId,
          type: canvasEvent.type,
          layerId: canvasEvent.layerId,
          size: canvasEvent.size,
          points: canvasEvent.points
        }
      ];
      break;
    default:
      break;
  }

  nextState.activeRoi = deriveRoiForCanvasEvent(canvasEvent, nextState);
  return nextState;
}

export function selectVariant(state, variantId) {
  return {
    ...state,
    selectedVariantId: variantId,
    version: state.version + 1,
    updatedAt: new Date().toISOString()
  };
}

export function recordGeneratedSeeds(state, seeds) {
  return {
    ...state,
    seedHistory: [...state.seedHistory, ...seeds].slice(-64),
    updatedAt: new Date().toISOString()
  };
}

export function recordRefinedAsset(state, assetId) {
  return {
    ...state,
    latestRefinedAssetId: assetId,
    updatedAt: new Date().toISOString()
  };
}

export function recordUpscaledAsset(state, assetId) {
  return {
    ...state,
    latestUpscaledAssetId: assetId,
    updatedAt: new Date().toISOString()
  };
}
