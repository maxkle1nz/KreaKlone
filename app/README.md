# App Service Scaffold

This container wraps the current browser canvas frontend, REST API, and WebSocket gateway.

## Responsibilities

- serve `apps/web`
- expose the orchestration API from `apps/server/src/server.js`
- bridge browser sessions into the preview/refine/upscale queues
- surface `/api/benchmarks` for Genesis benchmark planning

## Runtime contract

- `PORT` defaults to `3000`
- `HOST` defaults to `0.0.0.0` in container environments
- future wiring points: `REDIS_URL`, `PREVIEW_WORKER_URL`, `REFINE_WORKER_URL`, `UPSCALE_WORKER_URL`
