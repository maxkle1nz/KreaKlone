# RunPod Production Path

This project now supports two deployment lanes on RunPod:

## Lane A: Pod bootstrap

Use for manual debugging and iterative bring-up.

- Repo checkout in `/workspace/KreaKlone.auth`
- ComfyUI checkout in `/workspace/ComfyUI`
- Start command:

```bash
bash /workspace/KreaKlone.auth/runpod/startup.sh
```

- Exposed ports:

```text
3000,8188
```

- TCP:

```text
22
```

## Lane B: Serverless / Hub / Docker image

Use for a more stable public generation backend.

Artifacts:

- [`.runpod/hub.json`](/Users/cosmophonix/.openclaw/KreaKlone/.runpod/hub.json)
- [`.runpod/tests.json`](/Users/cosmophonix/.openclaw/KreaKlone/.runpod/tests.json)
- [`.runpod/Dockerfile`](/Users/cosmophonix/.openclaw/KreaKlone/.runpod/Dockerfile)
- [`.runpod/handler.py`](/Users/cosmophonix/.openclaw/KreaKlone/.runpod/handler.py)
- [`serverless/comfy-lb-worker/Dockerfile`](/Users/cosmophonix/.openclaw/KreaKlone/serverless/comfy-lb-worker/Dockerfile)

### Recommended preference

If GitHub/Hub builds are flaky, prefer:

1. Build `serverless/comfy-lb-worker/Dockerfile`
2. Push to Docker Hub
3. Deploy that image into a RunPod Load Balancing endpoint

This avoids repeated Hub build failures while keeping the same runtime contract.

## Why two lanes exist

- The Pod route is better for debugging and full-stack inspection.
- The serverless/Docker image route is better when Pod HTTP proxy behavior is unstable.
