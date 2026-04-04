# Ylimit Design Import

This directory vendors the current `ylimit` frontend implementation as a reference source for KreaKlone/Ylimit frontend evolution.

## Why this exists

The designers already pushed a much more advanced UI than the current local scaffold, especially for:

- unified timeline
- music synchronization
- export flows
- advanced canvas tooling
- live output presentation

Instead of re-creating those ideas from screenshots and docs alone, this repo now carries the actual frontend source as a reference import.

## What is imported

- `design-import/ylimit-frontend/`

That tree includes:

- React/Vite app shell
- `Studio.tsx`
- `UnifiedTimeline.tsx`
- `DrawingCanvas.tsx`
- `LiveOutput.tsx`
- `PromptBar.tsx`
- `CompositionPanel.tsx`
- hooks for music, session, and composition
- export utilities
- styles and public assets

## Important rule

This imported tree is a `reference implementation`, not yet the production frontend of this repo.

Do not assume it is wired to the current local backend one-to-one.

## Current relationship to our system

Our system already has:

- worker-backed preview/refine/upscale runtime
- WebSocket transport
- timeline contracts
- session state for frame history
- design handoff docs

The imported frontend has:

- stronger timeline UX
- stronger music sync UX
- stronger export UX
- a richer component system

## What still needs adaptation

Before this frontend can replace the current scaffold cleanly, we need to align:

1. frontend/backend message names
2. session state model
3. frame vs variant semantics
4. record and export behavior
5. worker and lane status handling

## Recommended integration order

1. Align `useYlimitSession` with our current backend
2. Adapt `UnifiedTimeline` to our timeline events and state
3. Adapt `DrawingCanvas` to our canvas event contract
4. Adapt `LiveOutput` to our active frame / worker-backed preview model
5. Merge export and recording flows

## Key entrypoints

- `design-import/ylimit-frontend/src/pages/Studio.tsx`
- `design-import/ylimit-frontend/src/components/UnifiedTimeline.tsx`
- `design-import/ylimit-frontend/src/hooks/useYlimitSession.ts`
- `design-import/ylimit-frontend/src/hooks/useMusicSync.ts`
