# Sub-200ms Real-Time Image Editing: Technical Deep Research

Generated on 2026-04-03.

## Bottom Line

For `interactive AI image editing under 200 ms`, there are two very different targets:

- `Inference-only latency`: the model backend returns a result in under 200 ms
- `End-to-end product latency`: canvas event -> upload -> queue -> inference -> return -> composite in under 200 ms

The first is possible today in carefully optimized setups.
The second is much harder and usually requires:

- a very fast preview model
- `TensorRT` or equivalent acceleration
- `ROI-only` updates
- a warm model already resident in GPU memory
- extremely low transport overhead
- a nearby region or local execution

For a browser product over the public internet, `<200 ms end-to-end` is a stretch target, not a default expectation.

## What The Pasted Summary Gets Right

### 1. The winning pattern is architectural, not just hardware

Correct.

You do not reach Krea-like responsiveness by renting a random GPU and serving a normal img2img endpoint. The system must be built around:

- low-step preview
- streaming or burst preview
- ROI regeneration
- asynchronous refine and upscale

This matches both the practical product pattern and the published `StreamDiffusion` design.

Source: [StreamDiffusion ICCV 2025 paper](https://openaccess.thecvf.com/content/ICCV2025/papers/Kodaira_StreamDiffusion_A_Pipeline-level_Solution_for_Real-Time_Interactive_Generation_ICCV_2025_paper.pdf)

### 2. `StreamDiffusion + TensorRT + low-step model` is a real technique

Correct.

The official StreamDiffusion project explicitly supports a TensorRT installation path and ships real-time demos. The paper describes the key optimizations as:

- `Stream Batch`
- `Residual CFG`
- `Stochastic Similarity Filtering`
- `IO queue`
- `pre-computation`
- `TensorRT`

The paper reports:

- up to `91.07 fps` on a single `RTX 4090`
- average inference time of `10.98 ms` for `1-step img2img`
- average inference time of `26.93 ms` for `4-step img2img`

These are pipeline numbers, not browser round-trip product latency.

Sources:

- [StreamDiffusion GitHub](https://github.com/cumulo-autumn/StreamDiffusion)
- [ICCV 2025 paper](https://openaccess.thecvf.com/content/ICCV2025/papers/Kodaira_StreamDiffusion_A_Pipeline-level_Solution_for_Real-Time_Interactive_Generation_ICCV_2025_paper.pdf)

### 3. `SDXL Turbo` and similar low-step models matter a lot

Correct.

`SDXL-Turbo` and similar models are exactly the right family for preview lanes because they compress generation into a very small number of steps.

Source: [SDXL-Turbo](https://huggingface.co/stabilityai/sdxl-turbo)

### 4. `T4` is not the right target if the goal is a premium sub-200ms product

Mostly correct.

`T4` is still useful for PoCs, cost-sensitive inference, and narrow ROI experiments. But if the promise is aggressive real-time editing with headroom, the T4 should be treated as the low end, not the winning tier.

## What Needs More Nuance

### 1. “Below 200 ms” needs a strict definition

This is the most important caveat.

`StreamDiffusion` can absolutely demonstrate very low model-side latency. But that does not automatically mean:

- browser event captured
- diff computed
- ROI cropped
- request sent
- request scheduled
- image generated
- image returned
- image composited

all within 200 ms.

That full pipeline requires extreme optimization and usually one of these deployment patterns:

- local app with local GPU
- edge region very close to the user
- warm serverless path with tiny transport payload
- streaming inference with persistent connection and ROI payloads

### 2. `fal.ai` is fast, but it is not open source

Correct as a speed reference, wrong if interpreted as an open-source solution.

`fal.ai` is useful as a benchmark for how fast a managed service can feel. But it is a hosted proprietary platform, not the open-source product stack itself.

Current public pricing examples are pay-per-megapixel, not fixed “cheap monthly GPU” pricing:

- `Z-Image Turbo`: `US$0.005/MP`
- `Z-Image Turbo image-to-image`: `US$0.005/MP`
- `Z-Image Turbo inpaint`: `US$0.005/MP`

Sources:

- [fal Z-Image Turbo](https://fal.ai/z-image-turbo)
- [fal Z-Image Turbo text-to-image](https://fal.ai/models/fal-ai/z-image/turbo)
- [fal Z-Image Turbo image-to-image](https://fal.ai/models/fal-ai/z-image/turbo/image-to-image)

### 3. `0.001/img` claims should be treated carefully

I did not find a current official public fal pricing page showing a generic `US$0.001/image` price for a T4-class real-time editing path. The public pricing I could verify is model-specific and generally expressed per megapixel or per image for specific hosted models.

## Open-Source Projects That Actually Help

## 1. StreamDiffusion

Role: `core technique`, not a polished product shell

Why it matters:

- official real-time `txt2img` and `img2img` demos
- TensorRT install path
- it is the clearest open-source reference for the sub-200ms style of optimization

What it is missing:

- not a production-ready collaborative product
- not a polished browser canvas system by itself

Sources:

- [StreamDiffusion GitHub](https://github.com/cumulo-autumn/StreamDiffusion)
- [Release notes with realtime img2img demo](https://github.com/cumulo-autumn/StreamDiffusion/releases)

## 2. Krita AI Diffusion

Role: `best open-source artist-facing editor reference`

Why it matters:

- real layers, masks, selections, prompts, references
- `Live Painting`
- queue and cancel behavior
- `Flux Kontext` support

Why it is not the product shell:

- desktop plugin
- built for creators, not for low-latency multi-user web serving

Source: [krita-ai-diffusion](https://github.com/Acly/krita-ai-diffusion)

## 3. GIMP + ComfyUI plugin

Role: `useful open-source proof of near-realtime editing`

Why it matters:

- explicitly describes connecting real-time image editing to generation via the ComfyUI web API
- sends edited layers into ComfyUI as the user works

Source: [gimp_comfyui](https://github.com/Charlweed/gimp_comfyui)

## 4. IntraPaint

Role: `all-in-one editing reference`

Why it matters:

- combines digital painting with AI generation
- can connect to ComfyUI, Forge, or Automatic1111-class backends

Why it is not enough alone:

- good product reference, but not a complete answer to sub-200ms serving architecture

Source: [IntraPaint](https://github.com/centuryglass/IntraPaint)

## 5. TouchDiffusion / TouchDesigner integrations

Role: `excellent evidence that real-time interactive diffusion is practical`

Why it matters:

- shows concrete fps numbers for SD-Turbo on gaming GPUs
- cites `55-60 FPS` on `RTX 4090` at `512x512`, batch size 1

Why it is limited:

- not the browser SaaS shell you want
- best understood as proof that the preview lane can be genuinely fast

Source: [TouchDiffusion](https://github.com/olegchomp/TouchDiffusion)

## 6. ComfyUI realtime ecosystem

Role: `backend experimentation environment`

Useful references:

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
- [comfyui-web-viewer](https://github.com/VrchStudio/comfyui-web-viewer)
- [ComfyUI Realtime Nodes](https://github.com/ryanontheinside/ComfyUI_RealtimeNodes)

Why it matters:

- there is real momentum around real-time interaction in the ComfyUI ecosystem
- useful for rapid prototyping

Why it should not be your final shell:

- product-critical latency behavior is easier to control in a dedicated service than in a general-purpose workflow graph

## 7. Real-time browser demos

Useful references:

- [Real-Time-Latent-Consistency-Model](https://github.com/radames/Real-Time-Latent-Consistency-Model)
- [ViewComfy](https://github.com/ViewComfy/ViewComfy)

These are useful for implementation patterns, but they are not yet the same as a mature, open-source Krea clone.

## Is There A Full Open-Source Krea Clone?

No, not really.

There are three categories of things that exist:

- `core acceleration techniques`: StreamDiffusion and related low-step pipelines
- `strong editor integrations`: Krita AI Diffusion, GIMP plugin, IntraPaint
- `realtime workflow experiments`: TouchDiffusion, realtime ComfyUI nodes, MJPEG/WebSocket demos

What does not yet exist as a single mature dominant package:

- a polished browser-native Krea-class product
- with prompt, image references, drawing, mask, region prompt, burst previews, async refine, and production-grade low latency
- all bundled as a single open-source stack

## Hardware Conclusions

### T4

Use for:

- PoC
- narrow benchmarks
- basic preview tests

Do not use as the default answer for a premium real-time product promise.

### 4090 / L40S / top-end NVIDIA

Use for:

- serious sub-200ms preview experiments
- high-throughput local or near-edge serving
- real-time demo quality

### H100 / B200 class

Use for:

- extreme throughput
- multi-user or high-end video/research scenarios

Not necessarily the first commercial winner if cost matters.

## Practical Recommendation

If your target is a Krea-like product with the strongest shot at `<200 ms` perceived responsiveness:

1. Build a custom browser canvas.
2. Use `WebSocket`, not request/response HTTP, for the interactive loop.
3. Track `ROI` aggressively and never default to full-frame rerender.
4. Use a preview lane built around `SDXL-Turbo` or an equally fast low-step model.
5. Use `StreamDiffusion + TensorRT` as the first optimization track for self-hosted preview.
6. Keep the refine lane separate, with `Qwen-Image-Edit` or a similar stronger edit model.
7. Treat `fal.ai` as a speed benchmark and optional hosted baseline, not as the open-source answer.
8. Treat `Krita AI Diffusion` as the strongest interaction reference for what the product should feel like.

## Final Verdict

Your pasted summary is directionally right.

The main corrections are:

- `<200 ms` must be distinguished between `inference-only` and `end-to-end`
- `fal.ai` is a fast hosted benchmark, not an open-source stack
- `StreamDiffusion` is real and very relevant, but it is not a complete product shell
- there are real open-source canvas/editor projects that help a lot, but there is still no single complete, mature open-source Krea clone

The closest open-source path today is:

- `custom web canvas`
- `StreamDiffusion/TensorRT preview lane`
- `Qwen-Image-Edit refine lane`
- `Krita AI Diffusion` as the interaction and workflow reference
