# Web V2 Integration Lane

This folder is reserved for the progressive integration of the imported Ylimit frontend into the local KreaKlone runtime.

## Purpose

- keep the current lightweight `apps/web` scaffold running
- build a richer `studio-v2` path against the same backend
- integrate the imported designer UI in controlled slices

## First target

The first milestone in this lane is:

- wire a richer session hook
- mount a timeline-first shell
- prepare the path for `UnifiedTimeline`, `DrawingCanvas`, and `LiveOutput`

## Rule

This folder is an integration lane, not yet the production frontend entrypoint.

## Current status

- `npm run typecheck --prefix apps/web-v2` passes
- `npm run build --prefix apps/web-v2` passes
- the lane proxies `/api` and `/ws` to the local backend on `127.0.0.1:3000`
- the root server can now serve the built bundle with `WEB_APP_VARIANT=v2`

## Useful commands

- local designer UI dev server:
  - `npm run dev:web-v2`
- build the designer UI bundle:
  - `npm run build:web-v2`
- serve the built designer UI through the Node backend:
  - `npm run serve:web-v2`
