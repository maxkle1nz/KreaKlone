# Worker And Lane Contracts

## System Lanes

### Preview Lane

Purpose:

- fast frame generation
- user-visible responsiveness

Current state:

- worker-backed
- supports `synthetic` and `real` provider abstraction
- still semantically uses burst naming in parts of the runtime

### Refine Lane

Purpose:

- improve chosen frame quality
- semantic fidelity after user commits

Current state:

- scaffolded worker
- still synthetic in behavior

### Upscale Lane

Purpose:

- enlarge accepted output
- preserve responsive preview flow by running asynchronously

Current state:

- scaffolded worker
- still synthetic in behavior

### Record Lane

Purpose:

- export output-only or full-session recordings

Current state:

- currently only represented in product docs and frontend-facing control intent
- not yet a full backend lane

## Worker Health Contracts

Current workers expose:

- `GET /health`
- `GET /manifest`
- `POST /jobs/preview`
- `POST /jobs/refine`
- `POST /jobs/upscale`

## Failure Contract

If a worker fails:

- runtime must emit `job.failed`
- runtime increments `worker_failure_count`

Design implication:

- the UI can and should surface lane-specific failure states
- failure should not silently disappear
