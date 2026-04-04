# Krea-Like Product Blueprint

## Goal

Build a browser-based AI image editing product that feels real-time by combining:

- prompt-driven generation
- reference-image conditioning
- mask and brush editing
- region-of-interest regeneration
- frame-stream preview on the same composition
- timeline playback and loop ranges
- async refine
- async upscale
- record output or full-session playback

The first product milestone is not "best final image quality." It is:

`Make editing feel immediate without collapsing quality later.`

## Architecture Overview

```mermaid
flowchart LR
    UI["Left Canvas UI"] --> API["Session / Orchestration API"]
    API --> TIMELINE["Timeline / Output Rail"]
    API --> ROI["ROI Extractor"]
    API --> STATE["Session State Store"]
    ROI --> PREVIEW["Preview Queue"]
    ROI --> REFINE["Refine Queue"]
    ROI --> UPSCALE["Upscale Queue"]
    TIMELINE --> RECORD["Record Queue"]
    PREVIEW --> PREVIEW_SVC["Preview Inference Service"]
    REFINE --> REFINE_SVC["Refine Inference Service"]
    UPSCALE --> UPSCALE_SVC["Upscale Service"]
    RECORD --> RECORD_SVC["Recording Service"]
    PREVIEW_SVC --> STATE
    REFINE_SVC --> STATE
    UPSCALE_SVC --> STATE
    RECORD_SVC --> STATE
    STATE --> API
    API --> UI
```

## Core Product Loop

1. User changes prompt, mask, brush, reference, or region.
2. Frontend computes and sends a `CanvasEvent`.
3. Backend merges the event into `SessionState`.
4. Backend computes a `ROI`.
5. Backend submits a `PreviewJob`.
6. Preview service generates sequential low-step frames for the same composition.
7. UI appends those frames to the right-hand timeline while the left panel stays editable.
8. User can scrub, play, and loop a range of recent frames.
9. After idle or explicit commit, backend submits a `RefineJob`.
10. After frame selection, backend submits an `UpscaleJob` or `RecordJob`.

## Public Interfaces

### CanvasEvent

```ts
type CanvasEvent =
  | { type: "brush"; strokeId: string; points: number[]; color: string; size: number; layerId: string }
  | { type: "erase"; strokeId: string; points: number[]; size: number; layerId: string }
  | { type: "mask.update"; maskId: string; points: number[]; mode: "add" | "subtract" }
  | { type: "prompt.update"; positive: string; negative?: string }
  | { type: "reference.add"; assetId: string; uri: string }
  | { type: "reference.remove"; assetId: string }
  | { type: "region.set"; x: number; y: number; width: number; height: number }
  | { type: "image.import"; assetId: string; uri: string; x: number; y: number };
```

### PreviewJob

```ts
type PreviewJob = {
  sessionId: string;
  roi: { x: number; y: number; width: number; height: number };
  prompt: { positive: string; negative?: string };
  references: string[];
  frameBudget: number;
  streamMode: "continuous" | "burst";
  frameStride: number;
  previewModel: "sdxl-turbo" | "flux-schnell";
};
```

### RefineJob

```ts
type RefineJob = {
  sessionId: string;
  sourceVariantId: string;
  roi: { x: number; y: number; width: number; height: number };
  prompt: { positive: string; negative?: string };
  references: string[];
  refineModel: "qwen-image-edit" | "flux-kontext";
};
```

### UpscaleJob

```ts
type UpscaleJob = {
  sessionId: string;
  sourceImageId: string;
  targetLongEdge: number;
  mode: "fast" | "high-detail";
};
```

### SessionState

```ts
type SessionState = {
  sessionId: string;
  layers: Array<{ id: string; assetId?: string; visible: boolean }>;
  masks: Array<{ id: string; layerId?: string }>;
  prompt: { positive: string; negative?: string };
  references: string[];
  activeRoi?: { x: number; y: number; width: number; height: number };
  seedHistory: number[];
  activeFrameId?: string;
  pinnedFrameIds?: string[];
  timelineFrames?: Array<{ frameId: string; createdAt: string; assetId: string }>;
  loopRange?: { startFrameId: string; endFrameId: string };
};
```

### RecordJob

```ts
type RecordJob = {
  sessionId: string;
  source: "output" | "full-session";
  startFrameId?: string;
  endFrameId?: string;
  format: "mp4" | "gif" | "webm";
};
```

## Lane Responsibilities

### Preview Lane

Responsibilities:

- accept ROI jobs
- produce sequential frames fast
- optimize for first-pixel latency, not final image quality

Default models:

- `SDXL-Turbo`
- `FLUX.1-schnell`

Rules:

- never block on upscale
- avoid full-frame rerender unless explicitly required
- prioritize `time to first frame` and steady frame cadence

### Refine Lane

Responsibilities:

- improve semantic fidelity
- preserve intent and reference consistency
- run after pause or user commit

Default models:

- `Qwen-Image-Edit`
- optional benchmark lane with `FLUX Kontext`

### Upscale Lane

Responsibilities:

- enlarge accepted outputs
- restore detail after the user has chosen a direction

Rules:

- always detached from the preview loop
- cancel stale upscale jobs when the user keeps editing

### Record Lane

Responsibilities:

- export output-only or full-session recordings
- never block preview
- support frame-range clips and live capture

## Queue Design

- `preview` queue has the highest priority
- `refine` queue runs after preview and can be canceled if the user edits again
- `upscale` queue runs only for selected images
- `record` queue runs only for selected frame ranges or explicit live capture

Cancellation behavior:

- new canvas edits invalidate in-flight refine jobs for the same ROI
- upscale jobs are invalidated when the selected variant changes

## Data Flow Rules

- store prompts, masks, ROI, and reference IDs in `SessionState`
- store image assets separately from session metadata
- keep `seed history` and ordered `timelineFrames` for playback, loop, and capture
- version the session state so stale preview/refine results can be discarded safely

## Product Phases

### Phase 1: Convincing PoC

- custom browser canvas
- ROI tracking
- prompt + references
- live frame stream
- right-hand timeline rail
- preview lane with `SDXL-Turbo`
- refine lane with `Qwen-Image-Edit`
- play/pause/scrub controls
- loop markers and recording stubs

Success criterion:

The product feels obviously faster than a standard img2img workflow and proves the interaction model.

### Phase 2: Latency Optimization

- add `FLUX.1-schnell` benchmark path
- optimize ROI packing and compositing
- tune burst size and queue policies
- add idle-triggered refine
- add cancellation semantics and stale-result dropping

Success criterion:

First useful preview appears in under one second on the target production GPU tier.

### Phase 3: Production Hardening

- model routing
- session durability
- job retries and observability
- GPU pool management
- usage limits, quota, and concurrency controls

Success criterion:

The system remains responsive and predictable with real user sessions and concurrent load.

## Recommended First Benchmarks

- `1024` prompt-only preview stream
- `1024` image+prompt preview stream
- `512-768 ROI` mask edit burst
- refine after `500-800 ms` idle
- upscale after explicit selection
- timeline playback loop over recent frames
- record output-only clip

## Why Preview-Fast + Refine-Later Is Mandatory

This is the main design law of the product:

- the user judges responsiveness from the first visible frame and how alive the stream feels
- the user judges quality after they commit to a direction or rewind to a better moment

Those are different moments, so they must be served by different lanes.
