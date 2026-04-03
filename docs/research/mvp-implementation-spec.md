# MVP Implementation Spec For The Krea-Like Product

Generated on 2026-04-03.

## Product Goal

Ship an MVP that proves this product promise:

`Prompt + references + brush/mask edits feel fast enough to be playful, while final quality improves asynchronously.`

The MVP is not trying to beat mature creative suites. It is trying to prove:

- `interactive preview`
- `ROI-only editing`
- `burst candidate generation`
- `selection-based refine`
- `async upscale`

## Success Criteria

The MVP is successful if:

- first preview candidate appears in under `1 second` on the target GPU
- users can edit an existing image with prompt + mask + references
- users can generate `4` preview variants per interaction
- selected variants can be refined and upscaled without blocking new edits
- stale jobs are canceled correctly when the user keeps editing

## Out Of Scope For MVP

- multi-user collaboration
- full team workspaces
- mobile apps
- infinite canvas
- advanced brush engines comparable to full digital painting apps
- training or fine-tuning custom models

## Recommended Tech Stack

### Frontend

- `Next.js` or `Vite + React`
- HTML5 canvas or WebGL-backed canvas
- `WebSocket` for the interactive channel
- local ROI extraction before upload when possible

### Backend

- `FastAPI` or `Node + TypeScript` API for orchestration
- dedicated `WebSocket` session service
- queue layer for `preview`, `refine`, and `upscale`
- Redis for transient session and queue coordination

### Inference

- `Preview lane`: `SDXL-Turbo`
- `Optional preview benchmark lane`: `FLUX.1-schnell`
- `Refine lane`: `Qwen-Image-Edit`
- `Acceleration`: `TensorRT` and `StreamDiffusion` for the preview lane where feasible

### Storage

- object storage for uploaded references, generated images, and selected outputs
- Redis or equivalent transient state store for active sessions
- Postgres only if persistent project/session history is needed in MVP v1.1

## Core User Flows

### Flow 1: Prompt-only burst generation

1. User enters prompt.
2. User clicks generate.
3. Backend creates a preview burst job with `4` seeds.
4. UI shows the first candidate as soon as it arrives.
5. Remaining candidates fill in progressively.

### Flow 2: Edit existing image with mask

1. User uploads image.
2. User paints mask or selects region.
3. User updates prompt.
4. Backend computes `ROI`.
5. Backend sends only ROI context into preview lane.
6. UI composites the burst results back into the image.

### Flow 3: Commit selected variant

1. User selects one burst candidate.
2. Backend submits `RefineJob`.
3. UI shows a processing state but remains editable.
4. Refined result returns and can replace the temporary preview.

### Flow 4: Upscale selected result

1. User clicks upscale.
2. Backend submits `UpscaleJob`.
3. Upscale runs asynchronously.
4. Final asset is stored and returned.

## System Components

### 1. Canvas Client

Responsibilities:

- render image and overlays
- collect prompt, references, and masking input
- compute changed rectangle when practical
- maintain optimistic UI state
- stream events over WebSocket

### 2. Session Service

Responsibilities:

- create and track session IDs
- merge incoming `CanvasEvent`s
- compute current session version
- reject stale inference results

### 3. ROI Extractor

Responsibilities:

- compute minimal changed region
- pad ROI to preserve visual continuity
- normalize ROI to model-friendly sizes

Rules:

- never use full-frame by default if a bounded ROI exists
- round ROI dimensions to the serving stack’s preferred size buckets

### 4. Preview Queue

Responsibilities:

- prioritize user-visible burst generation
- cancel stale jobs aggressively
- stream partial results back as they arrive

### 5. Refine Queue

Responsibilities:

- submit stronger edit pass only after selection or idle
- run lower priority than preview
- drop stale results if session version changed

### 6. Upscale Queue

Responsibilities:

- process only selected images
- never block preview
- write durable final asset

## API Surface

### REST

```http
POST /api/sessions
POST /api/assets/upload
POST /api/refine
POST /api/upscale
GET  /api/assets/:id
```

### WebSocket

Events sent by client:

- `session.join`
- `canvas.event`
- `preview.request`
- `preview.cancel`

Events sent by server:

- `session.state`
- `preview.started`
- `preview.partial`
- `preview.completed`
- `refine.completed`
- `upscale.completed`
- `job.canceled`
- `job.failed`

## Default Queue Policy

- `preview` priority: highest
- `refine` priority: medium
- `upscale` priority: low

Cancellation policy:

- any new edit invalidates older preview jobs for the same session version
- any new edit invalidates refine jobs tied to older preview selections
- upscale jobs survive only if still tied to the latest selected asset

## Default GPU Policy

### Production default

- `Primary`: `RTX 4090`
- `Fallback`: `L4`

### Why

- `4090` is the best speed/cost answer for the preview lane
- `L4` is the best cleaner cloud fallback if 4090 inventory is bad or noisy

## Deployment Topology

### Single-GPU MVP

- one app server
- one Redis instance
- one inference host
- object storage bucket

Recommended split:

- app/orchestration on CPU VM
- inference on dedicated GPU VM

### First Scale-Up

- separate preview and refine workers
- keep preview on the fastest GPU
- push refine/upscale to lower-priority workers if needed

## Test Plan

### Functional

- prompt-only generation returns `4` candidates
- reference image is preserved and affects the result
- masking changes only the intended ROI
- selected variant can be refined
- selected variant can be upscaled

### Latency

- first preview under `1 s`
- full `4` candidate burst under `1.5 s`
- refine under `5 s`

### Correctness

- stale results are dropped when a newer session version exists
- canceled jobs do not overwrite current canvas state
- ROI edits do not accidentally repaint untouched regions

## Phase Plan

### Phase 1

- prompt-only burst
- image upload
- mask editing
- SDXL-Turbo preview lane
- Qwen-Image-Edit refine lane

### Phase 2

- StreamDiffusion/TensorRT optimization
- FLUX.1-schnell benchmark path
- more aggressive cancellation and partial streaming

### Phase 3

- provider abstraction
- metrics and observability
- multi-user readiness

## Final Recommendation

Build the MVP around one design law:

`Use the fastest lane to keep the user engaged, and use stronger lanes only after the user has committed to a direction.`
