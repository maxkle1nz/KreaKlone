# Layout And Core Interactions

## Primary Layout

Two-column layout:

- `Left`: canvas and creation tools
- `Right`: generated output timeline and frame controls

Recommended hierarchy:

1. Main canvas stage on the left
2. Output frame rail / timeline on the right
3. Session controls and prompt controls accessible but visually secondary
4. Recording and playback controls close to the timeline, not buried in settings

## Left Side: Control Surface

This side should feel like a creative workstation.

Minimum tools to represent:

- brush
- erase
- mask
- region select
- prompt
- negative prompt
- image import
- reference management
- future text-on-canvas

## Right Side: Output Surface

This side should feel like a visual timeline, not a gallery.

Minimum elements:

- current generated frame
- list/rail of recent frames
- frame selection
- play
- pause
- scrub
- loop
- send to refine
- send to upscale
- record

## Core Interaction Loop

1. User edits left canvas.
2. Backend receives delta.
3. Backend schedules preview work.
4. New frame lands in timeline.
5. User watches output evolve.
6. User scrubs or loops recent frames.
7. User refines/upscales/records a chosen moment.

## UX Principle

Never make the user feel like they left the scene and entered a separate result picker.

The timeline is the memory of the same evolving scene.
