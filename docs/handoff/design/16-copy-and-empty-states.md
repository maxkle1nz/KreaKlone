# Copy And Empty States

## Goal

Provide stable product language for common UI states so design can stay consistent.

## Core Labels

- `Connect session`
- `Reconnect session`
- `Start stream`
- `Cancel jobs`
- `Upscale selected result`
- `Play`
- `Pause`
- `Loop`
- `Record`

## Canvas Empty States

### Fresh Session

- Title: `Start with a prompt, sketch, or image`
- Body: `Draw on the canvas, upload a reference, or describe the scene you want to evolve.`

### No ROI Set

- Body: `Drag on the canvas to guide the next region update, or leave it full-frame.`

### No Reference Yet

- Body: `Drop an image here to anchor the scene with a visual reference.`

## Timeline Empty States

### No Frames Yet

- Title: `No frames yet`
- Body: `Start the stream to watch the scene evolve on the right.`

### One Frame Only

- Body: `Playback unlocks once the timeline has more than one frame.`

### No Loop Range

- Body: `Choose a start and end frame to create a loop.`

## Recording Copy

### Idle

- `Record output`
- `Record full session`

### Active

- `Recording…`
- `Stop recording`

### Completed

- Title: `Recording ready`
- Body: `Your clip has been exported and is ready to review.`

## Error Copy

### Worker Failure

- Title: `Worker unavailable`
- Body: `The current lane failed. You can retry or continue editing.`

### Session Lost

- Title: `Connection lost`
- Body: `Trying to reconnect to your session.`

### Upload Failed

- Title: `Upload failed`
- Body: `That asset could not be imported. Try a different file or try again.`

### No Active Frame

- Title: `No active frame selected`
- Body: `Choose a frame from the timeline before refining, upscaling, or recording.`

## Status Copy

### Preview

- `Generating live frames…`
- `Preview stream active`
- `Preview stream complete`

### Refine

- `Refining selected frame…`
- `Refine completed`

### Upscale

- `Upscaling selected frame…`
- `Upscale completed`

### Recording

- `Recording output…`
- `Recording completed`

## Tone Rules

- concise
- clear
- product-like, not debug-like
- never overly apologetic
- never generic AI hype copy
