# Design System Checklist

## Goal

Give designers a concrete checklist for building the visual system of KreaKlone without losing the product's core identity.

## Brand / Feel

- The product should feel `cinematic`, `fast`, and `instrument-like`
- The left side should feel like a professional control desk
- The right side should feel like a live media timeline, not a gallery
- Avoid generic SaaS dashboard language
- Avoid default purple-on-white AI product aesthetics

## Layout Checklist

- Define a stable two-panel desktop layout
- Define a collapsed or stacked mobile layout
- Keep left-side tools accessible without covering the canvas
- Keep right-side timeline readable even when many frames accumulate
- Reserve space for playback and recording controls

## Typography

- Choose a strong display style for headers
- Choose a highly readable UI font for controls
- Ensure timeline metadata remains readable at small sizes
- Differentiate clearly between:
  - active frame
  - pinned frame
  - refined frame
  - recorded/exported asset

## Color System

- Define canvas background colors
- Define output panel colors
- Define active frame highlight
- Define loop range highlight
- Define recording state color
- Define failure state color
- Define refine/upscale state color

## Component Checklist

### Canvas Area

- top toolbar
- left-side tool rail
- prompt module
- negative prompt module
- reference upload module
- region selection overlay
- active mask overlay

### Timeline Area

- current frame focus panel
- rolling frame rail
- play button
- pause button
- scrub handle
- loop-in marker
- loop-out marker
- loop-active state
- record button
- frame actions: refine, upscale, pin

### System Feedback

- session connected / disconnected
- worker busy
- frame streaming
- job canceled
- job failed
- refine complete
- upscale complete
- recording complete

## Motion Checklist

- frame arrivals should feel continuous
- selection should feel precise, not floaty
- playback should feel media-grade
- loop feedback should be obvious
- recording state should be unmistakable

## Accessibility

- all timeline controls need keyboard access
- frame selection should be keyboard navigable
- state changes should be announced accessibly
- colors should not be the only indicator of active/loop/record states

## Deliverables Designers Should Produce

- layout system
- color tokens
- spacing tokens
- component specs
- interaction states
- timeline motion rules
- recording/export UI flows
