# Product Vision

## Core Idea

KreaKlone is not a "generate four images and pick one" product.

It is a `live visual instrument`:

- the user controls a composition on the left
- the system renders that composition continuously on the right
- recent generated frames accumulate into a timeline
- the user can scrub, play, loop, refine, upscale, and record

## Experience Goal

The product should feel like:

- drawing in a control space
- watching a living output stream
- steering one evolving scene rather than spawning disconnected variants

## The 2030 Version

The target experience is:

- `left panel`: control canvas, layers, mask, text, references, image imports
- `right panel`: generated output timeline
- `timeline`: recent frames, checkpoints, pinning, playback, looping
- `capture`: record output-only or full-session

## Product Laws

1. The left side is for `direction`.
2. The right side is for `observation`.
3. The timeline is not optional; it is part of the product identity.
4. The system should prioritize `time to first visible frame`.
5. Refine and upscale happen after the user has direction, not before.
6. Recording is a native action, not an afterthought.

## Current Backend Shape

The current backend still uses some `preview variant` terminology internally, but the product direction is now officially:

- `frame stream`
- `timeline`
- `playback`
- `loop`
- `record`

Design should follow the product direction, not the leftover scaffold naming.
