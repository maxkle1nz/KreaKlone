# MVP Implementation Spec For The Krea-Like Product

Generated on 2026-04-03.

## Product Goal

Ship an MVP that proves this product promise:

`Prompt + references + brush/mask edits feel fast enough to be playful, while final quality improves asynchronously.`

The MVP is not trying to beat mature creative suites. It is trying to prove:

- `interactive preview`
- `ROI-only editing`
- `live frame-stream generation on the same composition`
- `timeline playback / scrubbing / loop ranges`
- `selection-based refine`
- `async upscale`
- `record output or full-session playback`

## Success Criteria

The MVP is successful if:

- first preview candidate appears in under `1 second` on the target GPU
- users can edit an existing image with prompt + mask + references
- users can watch a continuous stream of frames for the same scene while they draw
- users can scrub recent frames, play them back, and loop a selected range
- users can refine and upscale the current frame without blocking new edits
- users can record the output stream or the full screen session
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
- split layout: left control canvas, right generated timeline/output panel
- playback controls: play, pause, scrub, loop-in, loop-out, record

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
- rolling frame timeline buffer per session
- clip/export artifacts for recordings

## Core User Flows

### Flow 1: Prompt-driven live frame stream

1. User enters prompt.
2. User clicks generate or starts drawing.
3. Backend creates a preview stream job for the current composition.
4. UI shows the first frame as soon as it arrives.
5. Additional frames keep landing in the right-hand timeline while the same scene evolves.

### Flow 2: Edit existing image with mask

1. User uploads image.
2. User paints mask or selects region.
3. User updates prompt.
4. Backend computes `ROI`.
5. Backend sends only ROI context into preview lane.
6. UI updates the generated timeline while keeping the left canvas as the control surface.

### Flow 3: Timeline playback and looping

1. User scrubs recent generated frames.
2. User presses play to review the stream.
3. User marks loop-in and loop-out frames.
4. The chosen range loops until paused.

### Flow 4: Commit current frame

1. User selects the current or a past frame from the timeline.
2. Backend submits `RefineJob`.
3. UI shows a processing state but remains editable.
4. Refined result returns and can replace the current preview checkpoint.

### Flow 5: Upscale selected result

1. User clicks upscale.
2. Backend submits `UpscaleJob`.
3. Upscale runs asynchronously.
4. Final asset is stored and returned.

### Flow 6: Record output

1. User clicks record.
2. User chooses `output-only` or `full-session`.
3. Backend captures the requested frame range or live session.
4. Recording is exported without blocking the preview loop.

## System Components

### 1. Canvas Client

Responsibilities:

- render image and overlays
- collect prompt, references, and masking input
- compute changed rectangle when practical
- maintain optimistic UI state
- stream events over WebSocket
- expose drawing, text, image import, selection, and masking tools

### 1.5 Timeline Client

Responsibilities:

- keep a rolling list of recent generated frames
- render frame thumbnails or cards in order
- support play, pause, scrubbing, and loop range controls
- expose pin, refine, upscale, and record actions for frames

### 2. Session Service

Responsibilities:

- create and track session IDs
- merge incoming `CanvasEvent`s
- compute current session version
- reject stale inference results
- track active frame, pinned frames, and loop selections

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

- prioritize user-visible frame generation
- cancel stale jobs aggressively
- stream sequential frames back as they arrive

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

### 7. Record Queue

Responsibilities:

- export output-only or full-session recordings
- never block preview
- capture frame ranges or live sessions asynchronously

## API Surface

### REST

```http
POST /api/sessions
POST /api/assets/upload
POST /api/refine
POST /api/upscale
POST /api/record/start
POST /api/record/stop
GET  /api/assets/:id
```

### WebSocket

Events sent by client:

- `session.join`
- `canvas.event`
- `preview.request`
- `preview.cancel`
- `timeline.play`
- `timeline.pause`
- `timeline.seek`
- `timeline.loop.set`
- `timeline.loop.clear`
- `record.start`
- `record.stop`

Events sent by server:

- `session.state`
- `preview.started`
- `preview.partial`
- `preview.completed`
- `timeline.frame`
- `timeline.snapshot`
- `refine.completed`
- `upscale.completed`
- `record.completed`
- `job.canceled`
- `job.failed`

## Default Queue Policy

- `preview` priority: highest
- `refine` priority: medium
- `upscale` priority: low
- `record` priority: low

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

- prompt-only generation yields a live frame stream for the same scene
- reference image is preserved and affects the result
- masking changes only the intended ROI
- timeline stores recent frames in order
- playback and loop ranges work on stored frames
- current frame can be refined and upscaled
- output-only and full-session recording flows can be triggered

### Latency

- first preview under `1 s`
- continuous frame stream remains responsive while editing
- refine under `5 s`

### Correctness

- stale results are dropped when a newer session version exists
- canceled jobs do not overwrite current canvas state
- ROI edits do not accidentally repaint untouched regions

## Phase Plan

### Phase 1

- prompt-only live frame stream
- image upload
- mask editing
- SDXL-Turbo preview lane
- Qwen-Image-Edit refine lane
- timeline rail with play/pause/scrub/loop
- record controls with stubbed output

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
