# Current Capabilities And Gaps

## What Already Works

- browser app scaffold
- canvas interaction
- prompt updates
- image upload / reference ingestion
- websocket session flow
- preview worker integration
- refine and upscale worker scaffolds
- public RunPod deployment
- worker failure signaling

## What Is Still Synthetic

- preview imagery can still be synthetic depending on provider config
- refine worker output is synthetic
- upscale worker output is synthetic
- recording/export backend is not fully implemented
- timeline is partially UX-first and not fully backend-first yet

## What Designers Can Safely Design Now

- left canvas tool system
- right output timeline
- frame rail interaction
- playback controls
- loop selection
- record/export controls
- pinned frame behavior
- current-frame actions like refine and upscale

## What Designers Should Treat As Evolving

- exact naming of `variant` vs `frame` in backend payloads
- whether some actions remain REST or move fully to WebSocket
- final recording/export technical constraints
- final persistence model for timeline history

## Recommended Designer Assumption

Design for the `2030 interaction model` now:

- left = control
- right = living output timeline
- playback and recording are native

Engineering will continue migrating the backend to match that model.
