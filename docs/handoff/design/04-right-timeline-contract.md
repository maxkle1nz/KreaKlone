# Right Timeline Contract

## Purpose

The right side shows the generated output stream and its recent history.

It is both:

- a viewer of the live scene
- a timeline for reviewing and selecting moments

## What Designers Should Assume

The timeline should support:

- rolling recent frames
- current active frame
- selected or pinned frame
- playback across recent frames
- loop-in / loop-out range
- refine current frame
- upscale current frame
- record from the current range

## Current Frontend Scaffold

The current frontend already includes visible controls for:

- play
- pause
- loop
- record

The data model is still partial, but design should treat these as product-level controls, not placeholders.

## Timeline Semantics

Each frame belongs to:

- the same evolving scene
- the same session
- a time order

The timeline is not a grid of independent candidates.

## Minimum Timeline Data Model

```ts
type TimelineFrame = {
  frameId: string;
  assetId: string;
  createdAt: string;
  ordinal: number;
  seed?: number;
  uri: string;
};
```

Recommended session-level UI state:

```ts
type TimelineUiState = {
  activeFrameId?: string;
  pinnedFrameIds: string[];
  loopRange?: { startFrameId: string; endFrameId: string };
  playbackMode: "stopped" | "playing" | "looping";
};
```

## Design Requirements

- It must be obvious which frame is active.
- It must be obvious which range is looped.
- It must be obvious whether the user is previewing, refining, or recording.
- Timeline controls should remain usable while the left canvas stays editable.
