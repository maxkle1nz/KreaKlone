#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-/workspace}"
APP_ROOT="${APP_ROOT:-${WORKSPACE_ROOT}/KreaKlone.auth}"
COMFY_ROOT="${COMFY_ROOT:-${WORKSPACE_ROOT}/ComfyUI}"
RUNPOD_STATE_DIR="${RUNPOD_STATE_DIR:-${WORKSPACE_ROOT}/runpod-state}"
LOG_DIR="${LOG_DIR:-${RUNPOD_STATE_DIR}/logs}"
PID_DIR="${PID_DIR:-${RUNPOD_STATE_DIR}/pids}"

PREVIEW_PORT="${PREVIEW_PORT:-4101}"
REFINE_PORT="${REFINE_PORT:-4102}"
UPSCALE_PORT="${UPSCALE_PORT:-4103}"
APP_PORT="${APP_PORT:-3000}"
COMFY_PORT="${COMFY_PORT:-8188}"
COMFY_ADAPTER_PORT="${COMFY_ADAPTER_PORT:-8189}"

COMFY_WORKFLOW_PATH="${COMFY_WORKFLOW_PATH:-${APP_ROOT}/comfy-workflow.json}"
COMFYUI_WORKFLOW_PATH="${COMFYUI_WORKFLOW_PATH:-${COMFY_WORKFLOW_PATH}}"
COMFYUI_POSITIVE_NODE_ID="${COMFYUI_POSITIVE_NODE_ID:-6}"
COMFYUI_NEGATIVE_NODE_ID="${COMFYUI_NEGATIVE_NODE_ID:-7}"
COMFYUI_SEED_NODE_ID="${COMFYUI_SEED_NODE_ID:-3}"
COMFYUI_WIDTH_NODE_ID="${COMFYUI_WIDTH_NODE_ID:-5}"
COMFYUI_HEIGHT_NODE_ID="${COMFYUI_HEIGHT_NODE_ID:-5}"
COMFYUI_BATCH_NODE_ID="${COMFYUI_BATCH_NODE_ID:-5}"
COMFYUI_OUTPUT_NODE_ID="${COMFYUI_OUTPUT_NODE_ID:-9}"

log() {
  printf '[runpod-startup] %s\n' "$*"
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    log "Node already present: $(node -v) / npm $(npm -v)"
    return
  fi

  log "Installing Node.js 22"
  apt-get update
  apt-get install -y curl ca-certificates gnupg git
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
  log "Installed Node: $(node -v) / npm $(npm -v)"
}

ensure_paths() {
  mkdir -p "${LOG_DIR}" "${PID_DIR}"
  test -d "${APP_ROOT}" || { log "App repo not found at ${APP_ROOT}"; exit 1; }
  test -d "${COMFY_ROOT}" || { log "ComfyUI not found at ${COMFY_ROOT}"; exit 1; }
  test -f "${COMFY_WORKFLOW_PATH}" || { log "Comfy workflow not found at ${COMFY_WORKFLOW_PATH}"; exit 1; }
}

stop_existing() {
  pkill -f 'preview-worker/index.js' || true
  pkill -f 'refine-worker/index.js' || true
  pkill -f 'upscale-worker/index.js' || true
  pkill -f 'apps/server/src/server.js' || true
  pkill -f 'preview-worker/comfyui-adapter.js' || true
  pkill -f 'python main.py --listen 0.0.0.0 --port' || true
}

start_comfy() {
  log "Starting ComfyUI on ${COMFY_PORT}"
  (
    cd "${COMFY_ROOT}"
    . .venv/bin/activate
    exec python main.py --listen 0.0.0.0 --port "${COMFY_PORT}"
  ) >"${LOG_DIR}/comfyui.log" 2>&1 &
  echo $! > "${PID_DIR}/comfyui.pid"
}

start_adapter() {
  log "Starting ComfyUI preview adapter on ${COMFY_ADAPTER_PORT}"
  (
    cd "${APP_ROOT}"
    export COMFYUI_BASE_URL="http://127.0.0.1:${COMFY_PORT}"
    export COMFY_WORKFLOW_PATH
    export COMFYUI_WORKFLOW_PATH
    export COMFYUI_POSITIVE_NODE_ID
    export COMFYUI_NEGATIVE_NODE_ID
    export COMFYUI_SEED_NODE_ID
    export COMFYUI_WIDTH_NODE_ID
    export COMFYUI_HEIGHT_NODE_ID
    export COMFYUI_BATCH_NODE_ID
    export COMFYUI_OUTPUT_NODE_ID
    export PORT="${COMFY_ADAPTER_PORT}"
    export HOST="0.0.0.0"
    exec node preview-worker/comfyui-adapter.js
  ) >"${LOG_DIR}/comfy-adapter.log" 2>&1 &
  echo $! > "${PID_DIR}/comfy-adapter.pid"
}

start_preview_worker() {
  log "Starting preview worker on ${PREVIEW_PORT}"
  (
    cd "${APP_ROOT}"
    export PREVIEW_PROVIDER="real"
    export PREVIEW_REAL_ADAPTER_URL="http://127.0.0.1:${COMFY_ADAPTER_PORT}"
    export PORT="${PREVIEW_PORT}"
    export HOST="0.0.0.0"
    exec node preview-worker/index.js
  ) >"${LOG_DIR}/preview-worker.log" 2>&1 &
  echo $! > "${PID_DIR}/preview-worker.pid"
}

start_refine_worker() {
  log "Starting refine worker on ${REFINE_PORT}"
  (
    cd "${APP_ROOT}"
    export PORT="${REFINE_PORT}"
    export HOST="0.0.0.0"
    exec node refine-worker/index.js
  ) >"${LOG_DIR}/refine-worker.log" 2>&1 &
  echo $! > "${PID_DIR}/refine-worker.pid"
}

start_upscale_worker() {
  log "Starting upscale worker on ${UPSCALE_PORT}"
  (
    cd "${APP_ROOT}"
    export PORT="${UPSCALE_PORT}"
    export HOST="0.0.0.0"
    exec node upscale-worker/index.js
  ) >"${LOG_DIR}/upscale-worker.log" 2>&1 &
  echo $! > "${PID_DIR}/upscale-worker.pid"
}

start_app() {
  log "Starting app server on ${APP_PORT}"
  (
    cd "${APP_ROOT}"
    export WEB_APP_VARIANT="v2"
    export HOST="0.0.0.0"
    export PORT="${APP_PORT}"
    export PREVIEW_WORKER_URL="http://127.0.0.1:${PREVIEW_PORT}"
    export REFINE_WORKER_URL="http://127.0.0.1:${REFINE_PORT}"
    export UPSCALE_WORKER_URL="http://127.0.0.1:${UPSCALE_PORT}"
    exec node apps/server/src/server.js
  ) >"${LOG_DIR}/app.log" 2>&1 &
  echo $! > "${PID_DIR}/app.pid"
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local timeout="${3:-120}"
  local started_at
  started_at="$(date +%s)"
  while true; do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      log "${name} ready at ${url}"
      return 0
    fi
    if (( $(date +%s) - started_at >= timeout )); then
      log "${name} failed to become ready at ${url}"
      return 1
    fi
    sleep 2
  done
}

main() {
  ensure_node
  ensure_paths
  stop_existing

  start_comfy
  wait_for_http "ComfyUI" "http://127.0.0.1:${COMFY_PORT}/system_stats" 300

  start_adapter
  wait_for_http "Comfy adapter" "http://127.0.0.1:${COMFY_ADAPTER_PORT}/health" 60

  start_preview_worker
  wait_for_http "Preview worker" "http://127.0.0.1:${PREVIEW_PORT}/health" 60

  start_refine_worker
  wait_for_http "Refine worker" "http://127.0.0.1:${REFINE_PORT}/health" 60

  start_upscale_worker
  wait_for_http "Upscale worker" "http://127.0.0.1:${UPSCALE_PORT}/health" 60

  start_app
  wait_for_http "App server" "http://127.0.0.1:${APP_PORT}/health" 60

  log "Startup complete"
  log "Logs: ${LOG_DIR}"
}

main "$@"
