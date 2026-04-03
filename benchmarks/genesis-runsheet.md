# Genesis Benchmark Runsheet

Use `npm run benchmarks:catalog` to export the canonical machine-readable benchmark plan.

## Recommended execution order

| Run | Scenario | Goal | Notes |
| --- | --- | --- | --- |
| G1 | B1 | Warm 1024 full-frame burst | Baseline first-preview latency |
| G2 | B3 | 512-768 ROI preview burst | Validate local-edit speed |
| G3 | B1 @ burst=8 | Burst stress pass | Measures preview queue pressure |
| G4 | B5 @ 768 ROI | ROI refine | Preferred first refine benchmark |
| G5 | B5 @ 1024 full | Full-frame refine | Capacity/fallback planning |
| G6 | B6 | Detached upscale | Verify preview remains responsive |

## Capture for every run

- preview-first / burst-complete / refine / upscale latency
- GPU utilization and VRAM peak
- stale cancel correctness
- queue depth before and after each run
