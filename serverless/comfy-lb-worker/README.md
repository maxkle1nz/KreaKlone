# ComfyUI Load-Balancing Worker

This folder packages the existing [ComfyUI preview adapter](/Users/cosmophonix/.openclaw/KreaKlone/preview-worker/comfyui-adapter.js) as a RunPod Serverless **Load Balancing Endpoint** worker.

## Why this exists

The app and preview worker already speak an HTTP adapter contract:

- `POST /preview`
- `GET /health`

RunPod's **Load Balancing Endpoints** are a better fit than Pod HTTP proxy when you want a stable public HTTP service with low coordination overhead.

## Image role

This image runs only the adapter layer. It expects a reachable ComfyUI instance and workflow JSON.

## Required environment variables

- `COMFYUI_BASE_URL`
  Example: `http://127.0.0.1:8188`
- `COMFYUI_WORKFLOW_PATH`
  Example: `/workspace/comfy-workflow.json`
- `COMFYUI_POSITIVE_NODE_ID`
- `COMFYUI_NEGATIVE_NODE_ID`
- `COMFYUI_SEED_NODE_ID`
- `COMFYUI_WIDTH_NODE_ID`
- `COMFYUI_HEIGHT_NODE_ID`
- `COMFYUI_BATCH_NODE_ID`
- `COMFYUI_OUTPUT_NODE_ID`

Optional:

- `COMFYUI_API_KEY`
- `COMFYUI_CLIENT_ID`
- `COMFYUI_MODEL_LABEL`
- `PORT`
- `HOST`

## Health route

The worker exposes:

- `GET /health`

Use this as the endpoint health probe or `/ping` equivalent routing target.

## App wiring

Point the preview worker at the load balancer:

```bash
PREVIEW_PROVIDER=real
PREVIEW_REAL_ADAPTER_URL=https://your-runpod-endpoint
```

## Notes

- The adapter currently returns base64 data URIs, which keeps the existing KreaKlone preview worker contract unchanged.
- If you later want object-storage URLs instead of data URIs, change the adapter output shape in one place without rewriting the preview worker.

## Docker build and push

If the RunPod Hub GitHub builder keeps failing, use this image path directly from a registry such as Docker Hub.

Example:

```bash
docker build --platform linux/amd64 -f serverless/comfy-lb-worker/Dockerfile -t your-dockerhub-user/kreaklone-comfy-lb:latest .
docker push your-dockerhub-user/kreaklone-comfy-lb:latest
```

Then deploy that image through:

- RunPod Serverless endpoint
- or a custom Pod / Pod Template

## Recommended deploy modes

### 1. Stable fallback

- Run the adapter image from Docker Hub
- Point it at a separately managed ComfyUI instance

### 2. Fully managed publication path

- Use the `.runpod/` worker for RunPod Hub / GitHub integration

The Docker image path is the more deterministic route when the Hub builder is unstable.
