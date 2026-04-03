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
