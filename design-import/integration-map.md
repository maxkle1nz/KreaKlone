# Ylimit Frontend -> KreaKlone Backend Integration Map

## Goal

Track how the imported `ylimit` frontend should map onto the current KreaKlone backend/runtime.

This document exists so we can integrate the designer frontend deliberately instead of by guesswork.

## High-Level Strategy

Do not replace the current local app in one jump.

Instead:

1. Keep the existing worker-backed backend as the source of truth.
2. Treat `design-import/ylimit-frontend` as the target UI.
3. Adapt hooks and components gradually.

## Key Frontend Entry Points

- `design-import/ylimit-frontend/src/pages/Studio.tsx`
- `design-import/ylimit-frontend/src/components/UnifiedTimeline.tsx`
- `design-import/ylimit-frontend/src/components/DrawingCanvas.tsx`
- `design-import/ylimit-frontend/src/components/LiveOutput.tsx`
- `design-import/ylimit-frontend/src/hooks/useYlimitSession.ts`

## Current Backend Capabilities We Can Map Today

### Session / Transport

Already available:

- `POST /api/sessions`
- `POST /api/assets/upload`
- `POST /api/preview`
- `POST /api/refine`
- `POST /api/upscale`
- `GET /api/assets/:id`
- `GET /api/benchmarks`
- `WebSocket /ws`

### WebSocket Events Already Supported

Client -> server:

- `session.join`
- `canvas.event`
- `preview.request`
- `preview.cancel`
- `timeline.play`
- `timeline.pause`
- `timeline.seek`
- `timeline.pin`
- `timeline.delete`
- `timeline.capacity.set`
- `timeline.loop.set`
- `timeline.loop.clear`
- `record.start`
- `record.stop`

Server -> client:

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

## Main Mismatches

### 1. `variant` naming still exists on both sides

The imported frontend still uses:

- `PreviewVariant`
- `liveVariants`
- `activeVariant`
- `selectVariant`

Our backend still also carries:

- `selectedVariantId`
- `sourceVariantId`

This is workable, but it is technical debt.

### 2. Some imported frontend calls assume endpoints we do not yet expose

The imported `useYlimitSession` expects or references behavior like:

- delete frame endpoint
- session settings endpoint
- richer record lifecycle

We have the WebSocket-side primitives in flight, but not every REST convenience endpoint yet.

### 3. Music sync is ahead of our current runtime

The imported frontend can pass:

- `audioPositionMs`

Our runtime can absorb this next, but the local product still does not fully use music-sync semantics end-to-end.

## Recommended Integration Order

### Step 1

Adapt a local copy of `useYlimitSession` to our current backend/runtime shape.

### Step 2

Mount `UnifiedTimeline` against our current `session.state`, timeline events, and recording stubs.

### Step 3

Mount `DrawingCanvas` against our current canvas event contract.

### Step 4

Replace the simple local `LiveOutput` with the imported one.

### Step 5

Bring in music-sync and export once the timeline and active frame semantics are stable.

## What We Should Not Do

- Do not copy the full imported frontend into production runtime and hope it works
- Do not rewrite the backend to match every imported assumption in one pass
- Do not keep screenshot-driven UI drift once we have the imported source locally

## Near-Term Objective

The first real convergence milestone is:

`Imported UnifiedTimeline + imported DrawingCanvas operating against the current worker-backed backend with no protocol regressions.`
