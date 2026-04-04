# REST API Contracts

## Current Endpoints

### `POST /api/sessions`

Creates a new session.

Response shape:

```json
{
  "session": {},
  "queues": {}
}
```

### `POST /api/assets/upload`

Uploads an imported image or reference.

Request shape:

```json
{
  "name": "reference.png",
  "uri": "data:image/png;base64,...",
  "mimeType": "image/png"
}
```

Response shape:

```json
{
  "assetId": "asset_xxx",
  "name": "reference.png",
  "kind": "upload",
  "mimeType": "image/png",
  "uri": "data:image/png;base64,...",
  "metadata": {},
  "createdAt": "..."
}
```

### `POST /api/preview`

Queues preview work for the current session.

Request:

```json
{
  "sessionId": "session_12345678",
  "burstCount": 4
}
```

Current semantics:

- still named as burst in the backend
- should be treated by design as `frame stream kickoff`

### `POST /api/refine`

Queues a refine job.

Request:

```json
{
  "sessionId": "session_12345678",
  "variantId": "preview_job_v1"
}
```

### `POST /api/upscale`

Queues an upscale job.

Request:

```json
{
  "sessionId": "session_12345678",
  "assetId": "asset_xxx"
}
```

### `GET /api/assets/:id`

Returns a stored asset.

### `GET /api/benchmarks`

Returns benchmark scenarios and runtime metrics.

## Planned REST Additions

These are part of the intended product contract and should guide design:

- `POST /api/record/start`
- `POST /api/record/stop`
- `POST /api/timeline/pin`
- `POST /api/timeline/unpin`

Design can rely on these emerging as dedicated actions.
