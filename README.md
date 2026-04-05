# KreaKlone Research Workspace

This workspace contains the technical research and implementation blueprint for a `Krea-like` real-time AI image editing product.

## Documents

- [Deep research](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/krea-realtime-deep-research.md)
- [Sub-200ms techniques](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/sub-200ms-realtime-techniques.md)
- [GPU/provider pricing](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/gpu-provider-pricing-fastest-stack.md)
- [Latency matrix by GPU](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/latency-matrix-by-gpu.md)
- [Build blueprint](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/krea-build-blueprint.md)
- [MVP implementation spec](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/mvp-implementation-spec.md)
- [Genesis deployment plan](/Users/cosmophonix/.openclaw/KreaKlone/docs/research/genesis-deployment-plan.md)
- [Benchmark matrix](/Users/cosmophonix/.openclaw/KreaKlone/docs/benchmarks/krea-benchmark-matrix.md)

## Current Conclusions

- `RTX 4090` is the best practical speed/cost winner for the preview lane
- `L4` is the strongest balanced production fallback
- `T4` is only a low-cost PoC option
- The product should be built around `left-canvas control + right-side live frame timeline + refine-later + upscale-last`
- Timeline is a first-class feature: scrub, play, set loop ranges, and record either output-only or the full session

## Frontend Lanes

- `apps/web`
  - the current lightweight scaffold UI
- `apps/web-v2`
  - the imported designer-driven `Ylimit` integration lane
  - builds successfully and can now be served through the backend with `WEB_APP_VARIANT=v2`

Useful commands:

- `npm run dev`
  - run the current backend + legacy scaffold UI
- `npm run dev:web-v2`
  - run the designer UI in Vite with `/api` and `/ws` proxied to the backend
- `npm run build:web-v2`
  - produce the static `web-v2` bundle
- `npm run serve:web-v2`
  - serve the built `web-v2` bundle through the Node backend
