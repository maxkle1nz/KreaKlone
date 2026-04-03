# Latency Matrix By GPU For The Krea-Like Stack

Generated on 2026-04-03.

## Purpose

This document estimates how the target stack should behave on the most relevant GPU tiers:

- `T4`
- `L4`
- `RTX 4090`
- `L40S`

The stack being evaluated is:

- `Preview lane`: `SDXL-Turbo` and optionally `FLUX.1-schnell`
- `Acceleration`: `TensorRT` and `StreamDiffusion` where supported
- `Refine lane`: `Qwen-Image-Edit`
- `Interaction model`: `ROI-only`, `burst 4-8`, `async refine`, `async upscale`

## Evidence Model

This matrix mixes two kinds of evidence:

### Published measurements

The strongest published real-time reference we have is `StreamDiffusion` on an `RTX 4090`.

The official repo reports, on `RTX 4090`:

- `SD-turbo`, `1 step`, `93.897 fps` on `img2img`
- `LCM-LoRA + KohakuV2`, `4 steps`, `37.133 fps` on `img2img`

That corresponds to roughly:

- `~10.6 ms` per image for `1-step img2img`
- `~26.9 ms` per image for `4-step img2img`

These are inference-pipeline numbers, not full browser product latency.

Sources:

- [StreamDiffusion GitHub](https://github.com/cumulo-autumn/StreamDiffusion)
- [StreamDiffusion ICCV 2025 paper](https://openaccess.thecvf.com/content/ICCV2025/papers/Kodaira_StreamDiffusion_A_Pipeline-level_Solution_for_Real-Time_Interactive_Generation_ICCV_2025_paper.pdf)

### Engineering estimates

For `L4`, `L40S`, and `T4`, the numbers below are engineering estimates based on:

- official GPU specs
- tensor throughput
- memory bandwidth
- published 4090 StreamDiffusion behavior
- the known shape of low-step diffusion preview workloads

They are designed to help pick a winner, not to pretend we already ran Genesis benchmarks.

## Hardware Snapshot

| GPU | VRAM | Memory bandwidth | FP16 / Tensor signal | Practical role |
| --- | ---: | ---: | ---: | --- |
| T4 | 16 GB | 320 GB/s | Oldest tier in this set | Budget PoC only |
| L4 | 24 GB | 300 GB/s | 242 TFLOPS FP16 Tensor | Clean low-cost production candidate |
| RTX 4090 | 24 GB | ~1008 GB/s | Very high consumer Ada throughput | Best speed/cost winner |
| L40S | 48 GB | 864 GB/s | 362 / 733 FP16 Tensor | Premium headroom |

Sources:

- [NVIDIA L4](https://www.nvidia.com/fr-fr/data-center/l4/)
- [NVIDIA L40S](https://www.nvidia.com/en-gb/data-center/l40s/)
- [NVIDIA RTX 4090](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/)
- [NVIDIA T4](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-t4/t4-tensor-core-datasheet-951643.pdf)

## Assumptions

These estimates assume:

- warm model already loaded in VRAM
- persistent WebSocket or equivalent low-overhead transport
- ROI update, not full-frame rerender, for edits
- burst previews at `768-1024`
- preview models running at `1-4` steps
- no cold-start penalties

They do not assume:

- full internet round-trip from a far-away region
- full-frame high-quality regeneration on every action
- concurrent multi-user saturation

## Expected Latency Matrix

## 1. Preview lane: first useful candidate

Target: the first candidate that makes the UI feel alive.

| GPU | SDXL-Turbo first preview | FLUX.1-schnell first preview | Verdict |
| --- | --- | --- | --- |
| T4 | `600-1800 ms` | `900-2500 ms` | Too weak for premium feel |
| L4 | `250-700 ms` | `450-1200 ms` | Very viable |
| RTX 4090 | `120-350 ms` | `250-700 ms` | Best practical result |
| L40S | `150-420 ms` | `280-800 ms` | Excellent, more premium than necessary |

Interpretation:

- `T4` can work for experiments, but it is not the right answer if the product promise is speed
- `L4` is already good enough to feel real-time in a serious preview lane
- `4090` is the best practical answer for the fastest possible preview behavior
- `L40S` is excellent, but usually not better enough than `4090` to justify its cost for this specific lane

## 2. Preview lane: full burst of 4 candidates

Target: total time until the user sees a meaningful burst set.

| GPU | SDXL-Turbo 4-image burst | FLUX.1-schnell 4-image burst | Verdict |
| --- | --- | --- | --- |
| T4 | `1.2-3.5 s` | `1.8-4.5 s` | Barely acceptable for PoC |
| L4 | `0.5-1.4 s` | `0.9-2.2 s` | Good |
| RTX 4090 | `0.25-0.8 s` | `0.5-1.4 s` | Best |
| L40S | `0.3-0.95 s` | `0.6-1.6 s` | Excellent |

Interpretation:

- `4090` is the most likely single-GPU winner for `burst preview`
- `L4` is still strong enough if the product can tolerate the burst filling in slightly more slowly

## 3. Refine lane: semantic edit after pause or commit

Target: a better image after the user has chosen a direction.

These are intentionally broader because `Qwen-Image-Edit` latency depends heavily on serving stack, step count, and edit complexity.

| GPU | Qwen-Image-Edit refine, 768-1024 | Verdict |
| --- | --- | --- |
| T4 | `6-20 s` | Too slow as the main refine tier |
| L4 | `2.5-8 s` | Acceptable |
| RTX 4090 | `1.5-5 s` | Strong |
| L40S | `1.2-4.5 s` | Best premium lane |

Interpretation:

- `Qwen-Image-Edit` is a refine model, not a per-stroke preview model
- `4090` and `L40S` are the strongest practical homes for refine
- `L4` can still work if refine is clearly asynchronous

## 4. Multi-lane pressure

The real product problem is not just “one preview request.”
It is:

- preview lane active
- stale job cancellation
- occasional refine lane
- optional upscale
- maybe more than one user

Here the ranking changes slightly:

| GPU | Headroom for preview + refine overlap | Notes |
| --- | --- | --- |
| T4 | Low | Easily overwhelmed |
| L4 | Medium | Fine for focused product scope |
| RTX 4090 | High | Best single-GPU value |
| L40S | Very high | Best premium safety margin |

## Winner By Objective

### Objective: cheapest possible start

Winner: `T4`

Use only if:

- the main goal is experimentation
- you are validating architecture, not premium UX

### Objective: clean low-cost production default

Winner: `L4`

Why:

- much faster than T4
- enough VRAM for the preview lane
- good enough for a real product if refine remains asynchronous

### Objective: fastest practical single-GPU product

Winner: `RTX 4090`

Why:

- best preview latency
- best burst behavior
- enough VRAM for the intended split lanes
- strongest speed/cost ratio for this product

### Objective: premium headroom and cleaner multi-user future

Winner: `L40S`

Why:

- 48 GB VRAM
- stronger overlap handling for preview, refine, and future scaling
- better fit if you want fewer compromises later

## Final Recommendation For Genesis

If the goal is still:

`the fastest possible Krea-like experience with reasonable cost`

Then the buying order should be:

1. `RTX 4090`
2. `L4`
3. `L40S`
4. `T4`

### Why 4090 wins

- It is the strongest practical preview GPU in this budget class
- It has the bandwidth profile that matters for fast image workloads
- It is the best fit for `SDXL-Turbo + StreamDiffusion/TensorRT`
- It is cheap enough on some providers that it beats slower “enterprise-clean” options on raw value

### When to choose L4 instead

Choose `L4` if:

- you want lower cost with more predictable cloud availability
- you want a cleaner provider experience
- you are okay with a slightly slower burst feel

### When to choose L40S instead

Choose `L40S` if:

- you expect multi-user concurrency soon
- you want more models resident simultaneously
- you care more about operational headroom than cost efficiency

## Practical Rule

For this product:

- `Preview lane winner`: `RTX 4090`
- `Balanced default winner`: `L4`
- `Premium future-proof winner`: `L40S`
- `PoC-only winner`: `T4`
