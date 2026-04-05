# RunPod Startup

Use [startup.sh](/Users/cosmophonix/.openclaw/KreaKlone/runpod/startup.sh) as the pod start command to make the environment self-heal after resets.

## Expected layout

- App repo at `/workspace/KreaKlone.auth`
- ComfyUI at `/workspace/ComfyUI`
- Exported API workflow at `/workspace/KreaKlone.auth/comfy-workflow.json`

## Required env before boot

- `COMFY_WORKFLOW_PATH` if not using the default `/workspace/KreaKlone.auth/comfy-workflow.json`
- Optional node IDs if your workflow differs from the starter defaults:
  - `COMFYUI_POSITIVE_NODE_ID`
  - `COMFYUI_NEGATIVE_NODE_ID`
  - `COMFYUI_SEED_NODE_ID`
  - `COMFYUI_WIDTH_NODE_ID`
  - `COMFYUI_HEIGHT_NODE_ID`
  - `COMFYUI_BATCH_NODE_ID`
  - `COMFYUI_OUTPUT_NODE_ID`

## Start command

```bash
bash /workspace/KreaKlone.auth/runpod/startup.sh
```

## Exposed ports

- `3000` app / Ylimit UI
- `8188` ComfyUI
- `22` SSH (optional)

## Logs

Written under:

```bash
/workspace/runpod-state/logs
```

Key files:

- `comfyui.log`
- `comfy-adapter.log`
- `preview-worker.log`
- `refine-worker.log`
- `upscale-worker.log`
- `app.log`
