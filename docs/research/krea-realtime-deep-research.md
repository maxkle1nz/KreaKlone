# Krea-Like Real-Time Editing and Image Generation

Generated on 2026-04-03 for the Genesis network deployment path.

## Executive Summary

The core technical insight is that a Krea-like product is not a single model or a single editor. It is a latency architecture:

- `preview-fast`: low-step, low-latency burst generation at working resolution
- `ROI-only`: regenerate only the edited region instead of the full frame
- `refine-later`: run a stronger edit model only after user pause or explicit commit
- `upscale-last`: defer expensive detail restoration and super-resolution until the user selects a candidate

Trying to run a single high-quality edit model on every brush stroke will not produce a Krea-like feel. The product must be split into `preview`, `refine`, and `upscale` lanes.

## What Krea-Like Real Time Probably Means

Observed product behavior strongly suggests this interaction pattern:

1. The user edits a canvas with prompt, references, and masks.
2. The backend computes a region of interest from the delta.
3. A preview lane generates `4-8` low-step variants for that region in a burst.
4. The UI composites those previews back into the working frame.
5. A refine lane runs after idle, selection, or explicit commit.
6. Upscale and detail restoration happen asynchronously after selection.

This explains how the system can feel real-time while still producing polished results.

## Hard Requirements For A Krea-Like Product

- `Sub-1s preview latency` at roughly `768-1024` working resolution
- `Burst generation` of `4-8` variants per user action
- `ROI regeneration` as the default path
- `Reference-aware editing` with prompt, image, mask, and optional structural guidance
- `Async refine` for semantic fidelity and consistency
- `Async upscale` for final output quality

## Open-Source Stack Audit

### 1. Krita + AI Diffusion

Recommendation: `editor reference`, not the product shell.

Strengths:

- Mature raster editor with real layers and masks
- The plugin exposes `Live Painting`, `inpainting`, `outpainting`, `regions`, `ControlNet`, `IP-Adapter`, and `Flux Kontext`
- Strong evidence that the workflow concepts needed for Krea-like interaction already exist in open source form

Weaknesses:

- Desktop creator workflow, not a low-latency web product
- Not designed as a multi-user, production-ready session backend

Why it matters:

This is the best proof that the interaction model is technically feasible with current open models and tools.

Source: [krita-ai-diffusion](https://github.com/Acly/krita-ai-diffusion)

### 2. InvokeAI

Recommendation: `editor and architecture reference`, not the final low-latency core.

Strengths:

- Mature `Unified Canvas`
- Strong support for inpainting, outpainting, and image-to-image workflows
- Good reference for how a coherent AI editing product can be structured

Weaknesses:

- The architecture is still oriented around a creative engine and app shell
- It is not optimized primarily around burst preview under one second

Why it matters:

InvokeAI is valuable for product interaction design and edit semantics, but the real-time path should still use a dedicated preview lane.

Source: [InvokeAI](https://github.com/invoke-ai/InvokeAI)

### 3. ComfyUI

Recommendation: `workflow backend candidate`, not the end-user product shell.

Strengths:

- Massive ecosystem for model orchestration
- Good for quickly testing edit chains, mask flows, and ROI workflows
- Official support for `AMD GPU (Linux) - ROCm 6.4 stable or ROCm 7.1 nightly`

Weaknesses:

- Node-graph UX is excellent for prototyping, but not for the final product
- Product-critical low-latency behavior should not depend on a general-purpose interactive workflow UI

Why it matters:

ComfyUI is the fastest way to validate the preview/refine/upscale split. It is best used as an experimentation backend or fallback orchestration layer behind a custom service.

Source: [ComfyUI system requirements](https://docs.comfy.org/installation/system_requirements/)

### 4. GIMP + ComfyUI

Recommendation: `editor reference` only.

Strengths:

- Useful evidence that near-real-time layer-driven editing is practical in open source

Weaknesses:

- Not the right shell for a Krea-like web product

Source: [gimp_comfyui](https://github.com/Charlweed/gimp_comfyui)

### 5. IntraPaint

Recommendation: `feature reference`, not the primary stack.

Strengths:

- All-in-one AI image editing app with layers and inpainting concepts

Weaknesses:

- Smaller ecosystem and weaker fit for a production-grade web architecture

Source: [IntraPaint](https://github.com/centuryglass/IntraPaint)

## Model Matrix

### Preview Lane

#### SDXL-Turbo

Role: `primary preview candidate`

Why it fits:

- Designed for `1-4` step generation
- Best match for low-latency interactive preview
- Strong fit for burst generation where quality is allowed to be provisional

Tradeoff:

- Preview quality is good for interaction, not for final output

Source: [SDXL-Turbo](https://huggingface.co/stabilityai/sdxl-turbo)

#### FLUX.1-schnell

Role: `secondary preview candidate`

Why it fits:

- Explicitly positioned around `1-4` step generation
- Good for fast ideation and candidate bursts

Tradeoff:

- Useful for speed, but still should not be the only lane in a Krea-like product

Source: [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell)

### Refine Lane

#### Qwen-Image-Edit

Role: `primary refine candidate`

Why it fits:

- Strong open model family for image editing by instruction
- The official Qwen repo highlights acceleration paths and also includes `Qwen-Image-Edit` as a core editing model

Tradeoff:

- Better edit fidelity than preview speed
- Should run after pause, selection, or commit, not on every stroke

Source: [Qwen-Image](https://github.com/QwenLM/Qwen-Image)

#### FLUX Kontext

Role: `secondary refine candidate`

Why it fits:

- Strong fit for edit consistency and iterative image changes
- Already integrated by ecosystems like Krita AI Diffusion, which makes it a practical research target

Tradeoff:

- License and commercialization constraints must be reviewed carefully before using it as the production default

Source: [krita-ai-diffusion](https://github.com/Acly/krita-ai-diffusion)

### Future Differentiator

#### Qwen-Image-Layered

Role: `future object-level or layer-aware editing research`

Why it matters:

- It points toward editable decomposition and more controllable semantic editing
- Not required for the first product milestone, but important as a future path for selective edits, object retention, and editable semantic layers

Source: [Qwen-Image](https://github.com/QwenLM/Qwen-Image)

## Inference Engine Matrix

### ComfyUI Workflows

Best for:

- rapid prototyping
- testing edit chains
- validating ROI and burst preview logic

Not ideal for:

- a production preview lane with strict latency budgets

### Diffusers-Native Services

Best for:

- explicit control over model loading
- lower orchestration overhead
- custom batching and ROI logic

Why it matters:

The preview lane should probably be a dedicated service, not a generic workflow graph.

### SGLang-Diffusion For Qwen

Best for:

- accelerated Qwen-family serving
- reducing friction when the refine lane depends on Qwen-Image-Edit or related models

Why it matters:

Qwen explicitly documents this acceleration path, making it a high-value research target for the refine lane.

Source: [Qwen-Image](https://github.com/QwenLM/Qwen-Image)

## Hardware Strategy

### Production Default: NVIDIA Cloud

Recommended because:

- real-time image generation stacks are still more mature and better accelerated on NVIDIA
- TensorRT-style and CUDA-focused optimization remains the practical default for sub-1s targets

### GPU Tiers

#### Do Not Use: T1000

Reason:

- Wrong class of GPU for this target
- Too constrained for burst preview and serious edit/refine flows

#### Minimum Plausible: T4

Reason:

- Can be used for proof-of-feasibility and narrow preview targets
- Not the recommended production baseline for a premium feel

#### Recommended First Production Target: L4 or A10

Reason:

- Better balance of latency, VRAM, and inference practicality for a first real product

#### Premium Single-User Or Small-Team: 4090 Cloud or L40S

Reason:

- Higher ceiling for burst preview and stronger refine throughput

### Secondary Dev Lane: RX 7900 XTX + ROCm

Recommendation:

- Keep it for local development, experimentation, and fallback benchmarking
- Do not bet the core production experience on ROCm if the product promise is real-time feel

Why:

- AMD officially supports RX 7900 XTX on ROCm Linux
- Official OS support is constrained enough that it should be treated as a controlled environment

Sources:

- [ROCm system requirements](https://rocm.docs.amd.com/projects/install-on-linux/en/develop/reference/system-requirements.html)
- [ROCm compatibility PDF snippet listing RX 7900 XTX](https://rocm.docs.amd.com/_/downloads/install-on-linux/en/docs-6.2.4/pdf/)

## Recommended Stack

### Fastest PoC Stack

- Frontend: custom browser canvas
- Session backend: lightweight API + queue
- Preview lane: `SDXL-Turbo`
- Refine lane: `Qwen-Image-Edit`
- Upscale lane: separate asynchronous super-resolution or high-detail refine pass
- Experiment backend: `ComfyUI` for quick workflow exploration

This stack is the fastest way to validate the product feel without overcommitting to the wrong backend.

### Recommended Production Stack

- Frontend: custom browser canvas with ROI tracking
- Orchestration: custom backend, not an off-the-shelf creator shell
- Preview lane: dedicated low-latency inference service for `SDXL-Turbo` and/or `FLUX.1-schnell`
- Refine lane: dedicated edit service for `Qwen-Image-Edit`, with `FLUX Kontext` treated as an optional benchmark path
- Upscale lane: detached postprocess service
- Experimentation lane: `ComfyUI` and `Krita AI Diffusion` kept as reference tools, not the production shell

## Reject List

- Do not try to make a single heavy edit model do everything in real time.
- Do not use `T1000` for this product goal.
- Do not treat Krita, GIMP, or InvokeAI as the final product shell.
- Do not rerender the whole frame by default when a region changed.
- Do not spend latency budget on final-quality output before the user has selected a candidate.

## Latency Budget

This is the working target for product design:

- Canvas event handling: `<= 50 ms`
- ROI extraction and job dispatch: `<= 100 ms`
- Preview burst first candidate visible: `<= 700-900 ms`
- Additional burst candidates: `<= 1200 ms`
- Refine after commit or idle: `1.5-5 s`
- Upscale/final polish: `2-10 s`, detached from interactive feedback

These numbers are intentionally product-facing. The exact model and GPU benchmark pass should be used to refine them later.
