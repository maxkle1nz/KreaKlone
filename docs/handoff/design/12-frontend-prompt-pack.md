# Frontend Prompt Pack

Use these prompts with designers or coding agents to generate frontend concepts aligned with the current backend contracts.

## Prompt 1: Product-Level UI Direction

```md
Design a premium creative AI interface for a product called KreaKlone.

The product has:
- a left control canvas where the user draws, masks, adds images, and edits prompts
- a right live output timeline where generated frames appear continuously
- playback controls like an audio/video timeline: play, pause, scrub, loop
- refine, upscale, and record actions attached to timeline frames

This should NOT feel like a dashboard.
It should feel like a futuristic visual instrument for steering one evolving scene in real time.

Key constraints:
- desktop-first two-panel layout
- dark, cinematic visual language
- timeline is a first-class feature
- output recording and loop controls must be visible
- current frame, loop range, and active recording state must be unmistakable

Deliver:
- layout concept
- component map
- color system
- interaction notes
```

## Prompt 2: Left Canvas Control Surface

```md
Design the left-side control canvas for KreaKlone.

Backend-supported interactions already include:
- brush
- erase
- mask.update
- prompt.update
- reference.add
- reference.remove
- region.set
- image.import

The left side should feel like a professional creative workstation.

Need:
- tool rail
- prompt controls
- reference upload
- visual ROI selection
- room for future text-on-canvas
- clean state feedback without clutter

Deliver:
- layout and hierarchy
- control group breakdown
- empty states
- active tool states
```

## Prompt 3: Right Timeline Output Rail

```md
Design the right-side output timeline for KreaKlone.

This is not a gallery of unrelated images.
It is the recent frame history of the same evolving scene.

The timeline must support:
- rolling recent frames
- active frame highlight
- frame scrubbing
- play
- pause
- loop-in / loop-out
- pin frame
- refine current frame
- upscale current frame
- record output

Deliver:
- timeline layout
- frame card design
- playback controls
- loop range UI
- current-frame vs pinned-frame state rules
```

## Prompt 4: Recording UX

```md
Design the recording UX for KreaKlone.

There are two recording modes:
- output-only
- full-session

The UI should make it clear:
- what is being recorded
- whether recording is active
- what frame range is included
- where the exported asset will appear

Deliver:
- record controls
- active recording state
- stop recording state
- completed recording state
- export affordances
```

## Prompt 5: Engineering-Aware Frontend Spec

```md
Design a frontend around these backend expectations:

WebSocket client events:
- session.join
- canvas.event
- preview.request
- preview.cancel
- timeline.play
- timeline.pause
- timeline.seek
- timeline.loop.set
- timeline.loop.clear
- record.start
- record.stop

WebSocket server events:
- session.state
- preview.started
- preview.partial
- preview.completed
- timeline.frame
- timeline.snapshot
- refine.completed
- upscale.completed
- record.completed
- job.canceled
- job.failed

The output should include:
- components
- state model
- loading/error states
- interaction flows
- edge cases
```
