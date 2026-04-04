# User Flows And Edge Cases

## Primary User Flows

### Flow A: Start A Live Scene

1. User opens the app.
2. User connects a session.
3. User enters a prompt.
4. User clicks `Start stream`.
5. Frames appear in the timeline.
6. User begins steering the scene.

### Flow B: Import An Image And Steer It

1. User uploads an image.
2. User sees it on the left canvas.
3. User adds prompt and mask/region.
4. The right timeline starts evolving the same scene.

### Flow C: Scrub And Replay

1. User sees several frames in the timeline.
2. User clicks a frame.
3. User scrubs through adjacent frames.
4. User presses play.
5. The timeline plays through recent generated frames.

### Flow D: Loop A Range

1. User chooses a start frame.
2. User chooses an end frame.
3. User enables loop.
4. Playback cycles only through that range.

### Flow E: Refine A Chosen Moment

1. User selects a frame.
2. User clicks refine.
3. UI shows processing.
4. Refined result arrives and becomes available.

### Flow F: Upscale A Chosen Moment

1. User selects a frame or refined output.
2. User clicks upscale.
3. UI shows processing.
4. Upscaled asset returns asynchronously.

### Flow G: Record Output

1. User clicks record.
2. User chooses output-only or full-session.
3. User stops recording.
4. Export artifact appears.

## Edge Cases Designers Must Cover

### Session / Connection

- no active session
- reconnecting session
- websocket disconnected
- background job finishes after reconnect

### Timeline

- no frames yet
- only one frame exists
- selected frame was invalidated by a new stream
- loop requested with fewer than two valid frames
- active frame removed or stale

### Preview / Stream

- stream starting
- stream paused
- stream canceled
- stream failed
- stale frame arrives after a newer edit

### Refine / Upscale

- refine requested without selected frame
- refine failed
- upscale requested without selected asset
- upscale failed
- refine/upscale completes while user is still editing

### Recording

- record requested with no active frame
- record canceled
- record failed
- output-only vs full-session mode confusion
- recording in progress while stream continues

### Upload / Assets

- upload too large
- upload invalid format
- asset unavailable later
- imported reference removed

## UX Rules For Edge Cases

- never silently fail
- never hide whether the frame is stale or current
- never let loop/record states become ambiguous
- always show whether the system is generating, refining, upscaling, or recording
