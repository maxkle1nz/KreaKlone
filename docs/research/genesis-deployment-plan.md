# Genesis Deployment Plan

Generated on 2026-04-03.

## Deployment Objective

Deploy the first serious Krea-like stack on Genesis using:

- `Primary target`: `RTX 4090`
- `Fallback target`: `L4`

The deployment must optimize for:

- fast preview latency
- minimal orchestration overhead
- easy benchmarking and rollback

## Recommended Environment

### GPU host

- Ubuntu `22.04` or `24.04`
- NVIDIA driver version aligned with the chosen CUDA/TensorRT stack
- Docker with NVIDIA runtime

### Core runtime

- Python serving environment for inference workers
- Node.js or Python orchestration service
- Redis
- object storage or S3-compatible bucket

## Host Roles

### 1. App / Orchestration Host

Responsibilities:

- serve frontend
- manage sessions
- expose REST + WebSocket endpoints
- talk to Redis
- dispatch jobs to inference workers

This can be a normal CPU VM.

### 2. GPU Preview Worker

Responsibilities:

- keep `SDXL-Turbo` loaded and warm
- run burst preview jobs
- use `TensorRT` / `StreamDiffusion` optimization where available

This should be the fastest GPU in the stack.

### 3. GPU Refine Worker

Responsibilities:

- run `Qwen-Image-Edit`
- handle stronger edit requests

Initially this can live on the same GPU as preview if load is low.

### 4. GPU Upscale Worker

Responsibilities:

- run detached upscale or high-detail finish jobs

Initially optional.

## Deployment Modes

### Mode A: Cheapest serious launch

- `1x L4`
- app + Redis on separate CPU host
- preview + refine on same GPU

Use if:

- you want a cleaner cloud experience
- you accept a slightly slower premium feel

### Mode B: Best practical launch

- `1x RTX 4090`
- app + Redis on separate CPU host
- preview + refine on same GPU initially

Use if:

- you want the fastest product feel per dollar
- you are okay with a more marketplace-style GPU provider if needed

### Mode C: Better production split

- `1x RTX 4090` for preview
- `1x L4` or second `4090` for refine/upscale
- separate CPU app/orchestration host

Use if:

- you want the preview lane isolated from refine pressure
- you expect more than one active user or lots of refine traffic

## Container Layout

### app

- frontend server
- REST API
- WebSocket gateway

### redis

- session versioning
- queue coordination

### preview-worker

- `SDXL-Turbo`
- `TensorRT` or equivalent acceleration path
- burst preview service

### refine-worker

- `Qwen-Image-Edit`
- lower-priority edit queue

### optional upscale-worker

- upscaler or detail restoration service

## Recommended First Benchmarks On Genesis

Run in this order:

1. `SDXL-Turbo`, full-frame `1024`, `4` burst
2. `SDXL-Turbo`, `512-768 ROI`, `4` burst
3. `SDXL-Turbo`, `8` burst
4. `Qwen-Image-Edit`, `768 ROI`
5. `Qwen-Image-Edit`, `1024 full`

Capture:

- first preview latency
- full burst latency
- refine latency
- GPU utilization
- VRAM peak
- stale job cancel correctness

## Metrics To Track

- `preview_first_ms`
- `preview_burst_complete_ms`
- `refine_ms`
- `cancel_success_rate`
- `stale_result_drop_rate`
- `gpu_memory_used_gb`
- `gpu_utilization_pct`
- `session_active_count`

## Rollout Strategy

### Stage 1

- private internal deployment
- one user at a time
- benchmark-only mode

### Stage 2

- limited user testing
- compare `4090` and `L4`
- decide whether preview lane needs permanent `4090`

### Stage 3

- production-ish deployment
- preview lane isolated
- refine/upscale moved to separate worker if needed

## Operational Rules

- never allow upscale to compete with live preview at the same priority
- cancel stale preview and refine jobs aggressively
- keep the preview model warm at all times
- restart workers automatically if TensorRT or CUDA state becomes unhealthy

## Final Recommendation

For Genesis, start with:

1. `RTX 4090` if the goal is the strongest UX immediately
2. `L4` if the goal is safer operational simplicity

If budget permits, the best first serious topology is:

- `1x 4090` for preview
- `1x L4` or second `4090` for refine/upscale
- separate CPU host for app and Redis
