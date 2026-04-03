# Krea-Like Benchmark Matrix

Use this matrix on Genesis to validate hardware, models, and latency targets.

## Test Scenarios

| ID | Scenario | Input | Expected outcome |
| --- | --- | --- | --- |
| B1 | Prompt burst | Prompt only, no refs | First preview under 1s, 4-8 candidates |
| B2 | Ref-guided burst | Prompt + 1 image ref | Burst preview with visible conditioning |
| B3 | ROI mask edit | Existing image + brush mask | Only edited region is regenerated |
| B4 | Region prompt edit | Existing image + selected region + prompt delta | Preview changes remain local to region |
| B5 | Idle refine | Accepted preview variant | Stronger edit within target refine latency |
| B6 | Async upscale | Accepted refined image | Final enlarged image without blocking preview loop |

## Metrics

Capture these metrics for every run:

- `time_to_first_preview_ms`
- `time_to_full_burst_ms`
- `time_to_refine_ms`
- `time_to_upscale_ms`
- `working_resolution`
- `burst_count`
- `step_count`
- `vram_peak_gb`
- `gpu_utilization_pct`
- `cancelation_correct`
- `stale_result_dropped`

## Hardware Matrix

| Tier | GPU | Role | Recommendation |
| --- | --- | --- | --- |
| Reject | T1000 | Not suitable for target | Do not use |
| Minimum | T4 | PoC or constrained preview testing | Benchmark only |
| Recommended | L4 | First serious production target | Strong candidate |
| Recommended | A10 | First serious production target | Strong candidate |
| Premium | 4090 cloud | High-end single-user or small-team | Strong candidate |
| Premium | L40S | Higher-end production | Strong candidate |
| Secondary dev | RX 7900 XTX + ROCm | Local dev and fallback experiments | Do not treat as production default |

## Model Matrix

| Lane | Model | Role | Default status | Notes |
| --- | --- | --- | --- | --- |
| Preview | SDXL-Turbo | Fast preview | Primary | Best first benchmark |
| Preview | FLUX.1-schnell | Fast preview | Secondary | Good speed comparison |
| Refine | Qwen-Image-Edit | Semantic edit fidelity | Primary | Best first refine benchmark |
| Refine | FLUX Kontext | Semantic edit fidelity | Secondary | Benchmark, license review required |
| Upscale | Project-selected SR path | Final output | Required | Must remain asynchronous |

## Run Sheet

### Preview Benchmarks

| Run | GPU | Model | Resolution | Steps | Burst | ROI size | First preview ms | Full burst ms | VRAM GB | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 |  | SDXL-Turbo | 1024 |  | 4 | Full |  |  |  |  |
| P2 |  | SDXL-Turbo | 1024 |  | 8 | Full |  |  |  |  |
| P3 |  | FLUX.1-schnell | 1024 |  | 4 | Full |  |  |  |  |
| P4 |  | SDXL-Turbo | 768 |  | 4 | 512 ROI |  |  |  |  |
| P5 |  | FLUX.1-schnell | 768 |  | 4 | 512 ROI |  |  |  |  |

### Refine Benchmarks

| Run | GPU | Model | Resolution | ROI size | Refine ms | VRAM GB | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 |  | Qwen-Image-Edit | 1024 | Full |  |  |  |
| R2 |  | Qwen-Image-Edit | 768 | 512 ROI |  |  |  |
| R3 |  | FLUX Kontext | 1024 | Full |  |  |  |

### Upscale Benchmarks

| Run | GPU | Source size | Target long edge | Upscale ms | VRAM GB | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| U1 |  | 1024 | 2048 |  |  |  |
| U2 |  | 1024 | 3072 |  |  |  |

## Acceptance Targets

| Metric | Target |
| --- | --- |
| First preview visible | `<= 900 ms` |
| Full burst visible | `<= 1200 ms` |
| Refine after idle or commit | `1.5-5 s` |
| Upscale detached from interaction | Yes |
| ROI-only regeneration default | Yes |
| Stale refine/upscale results discarded | Yes |

## Benchmark Notes

- Always test both `full-frame` and `ROI` cases.
- Always record whether a new edit correctly cancels old refine work.
- Always measure the first visible preview, not just total job completion.
- If the system can only hit the target on full-frame jobs by shrinking quality too far, the stack is not acceptable.
