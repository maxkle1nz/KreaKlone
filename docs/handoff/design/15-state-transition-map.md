# State Transition Map

## Goal

Show how the important UI states move over time so design can match the backend mental model.

## Session Lifecycle

### Session Created

- `sessionId` assigned
- `version = 0`
- no active frame
- no timeline frames

### Session Joined

- websocket connected
- initial `session.state` received
- UI transitions from disconnected to ready

## Generation Lifecycle

### Start Stream

Input:
- prompt entered or updated
- optional imported image / refs

State changes:
- stream requested
- preview queue becomes active
- first generated frame arrives

UI effects:
- timeline begins populating
- active frame becomes most recent frame

### New Frame Arrives

State changes:
- frame appended to timeline
- `activeFrameId` may advance
- timeline length increases

UI effects:
- right-side rail updates
- current output updates

### User Seeks To Older Frame

State changes:
- `activeFrameId` switches to chosen frame

UI effects:
- right-side current frame changes
- refine/upscale actions retarget to that frame

### Loop Enabled

State changes:
- `loopRange` becomes defined

UI effects:
- range visibly highlighted
- playback behavior constrained to selected range

### Loop Cleared

State changes:
- `loopRange = undefined`

UI effects:
- full timeline playback restored

## Refine Lifecycle

### Refine Requested

State changes:
- active frame marked as refining

UI effects:
- spinner/progress state

### Refine Completed

State changes:
- `latestRefinedAssetId` set

UI effects:
- frame updates or refined artifact appears

## Upscale Lifecycle

### Upscale Requested

State changes:
- active frame marked as upscaling

### Upscale Completed

State changes:
- `latestUpscaledAssetId` set

UI effects:
- export-ready higher resolution artifact appears

## Record Lifecycle

### Record Requested

State changes:
- recording state becomes active

UI effects:
- recording indicator on

### Record Completed

State changes:
- `latestRecordingAssetId` set

UI effects:
- exported clip becomes available

## Failure Lifecycle

### Job Failed

State changes:
- failure state emitted

UI effects:
- error visible near affected lane
- user can retry or continue editing

## Cancellation Lifecycle

### Stale Work Canceled

State changes:
- old job canceled
- new session version remains authoritative

UI effects:
- stale frame should never override current scene
- optional subtle cancellation notice is fine
