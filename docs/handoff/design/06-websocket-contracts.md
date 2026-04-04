# WebSocket Contracts

## Current Client -> Server Events

```ts
type ClientEventType =
  | "session.join"
  | "canvas.event"
  | "preview.request"
  | "preview.cancel"
  | "timeline.play"
  | "timeline.pause"
  | "timeline.seek"
  | "timeline.loop.set"
  | "timeline.loop.clear"
  | "record.start"
  | "record.stop";
```

## Current Server -> Client Events

```ts
type ServerEventType =
  | "session.state"
  | "preview.started"
  | "preview.partial"
  | "preview.completed"
  | "timeline.frame"
  | "timeline.snapshot"
  | "refine.completed"
  | "upscale.completed"
  | "record.completed"
  | "job.canceled"
  | "job.failed";
```

## Envelope Shape

All messages use:

```ts
type Envelope<T> = {
  type: string;
  payload: T;
  emittedAt: string;
};
```

## Important Note

The backend still primarily emits:

- `preview.started`
- `preview.partial`
- `preview.completed`

but the product should evolve toward:

- `timeline.frame`
- `timeline.snapshot`

as the primary designer-facing mental model.

## What Designers Should Rely On

- session state is always the source of truth
- frame arrivals are incremental
- stale work can be canceled
- refine/upscale/record complete asynchronously
- transport errors surface through `job.failed`
