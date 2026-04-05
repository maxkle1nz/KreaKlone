# Preview Worker Scaffold

Scaffold service for the warm preview lane.

## Responsibilities

- keep the fast preview model warm
- accept preview burst work first
- target `RTX 4090` by default with `L4` as fallback
- own benchmark scenarios `B1-B4`

## Provider modes

- default: synthetic scaffold previews
- real adapter: set `PREVIEW_PROVIDER=real` and `PREVIEW_REAL_ADAPTER_URL=http://host:port`

## ComfyUI adapter

This repo now includes a lightweight ComfyUI adapter server you can run beside the preview worker:

```bash
node preview-worker/comfyui-adapter.js
```

Required environment:

- `COMFYUI_BASE_URL=http://127.0.0.1:8188`
- `COMFYUI_WORKFLOW_PATH=/abs/path/to/workflow-api.json`
- `COMFYUI_POSITIVE_NODE_ID=<node id>`
- `COMFYUI_NEGATIVE_NODE_ID=<node id>`
- `COMFYUI_SEED_NODE_ID=<node id>`
- `COMFYUI_WIDTH_NODE_ID=<node id>`
- `COMFYUI_HEIGHT_NODE_ID=<node id>`
- `COMFYUI_BATCH_NODE_ID=<node id>`
- `COMFYUI_OUTPUT_NODE_ID=<node id>`

Then point the preview worker at it:

```bash
PREVIEW_PROVIDER=real \
PREVIEW_REAL_ADAPTER_URL=http://127.0.0.1:8189 \
node preview-worker/index.js
```
