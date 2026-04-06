import os
import subprocess
import time
from pathlib import Path

import requests
import runpod
from huggingface_hub import hf_hub_download


WORKSPACE = Path("/workspace")
REPO_ROOT = WORKSPACE / "repo"
COMFY_ROOT = WORKSPACE / "ComfyUI"
LOG_DIR = WORKSPACE / "runpod-logs"
CHECKPOINT_DIR = COMFY_ROOT / "models" / "checkpoints"
WORKFLOW_PATH = WORKSPACE / "comfy-workflow.json"

COMFY_PORT = int(os.getenv("COMFY_PORT", "8188"))
ADAPTER_PORT = int(os.getenv("ADAPTER_PORT", "8189"))
HOST = os.getenv("HOST", "0.0.0.0")

MODEL_REPO = os.getenv("MODEL_REPO", "stabilityai/sdxl-turbo")
MODEL_FILE = os.getenv("MODEL_FILE", "sd_xl_turbo_1.0_fp16.safetensors")
MODEL_ALIAS = os.getenv("MODEL_ALIAS", "sdxl_turbo.safetensors")

COMFYUI_POSITIVE_NODE_ID = os.getenv("COMFYUI_POSITIVE_NODE_ID", "6")
COMFYUI_NEGATIVE_NODE_ID = os.getenv("COMFYUI_NEGATIVE_NODE_ID", "7")
COMFYUI_SEED_NODE_ID = os.getenv("COMFYUI_SEED_NODE_ID", "3")
COMFYUI_WIDTH_NODE_ID = os.getenv("COMFYUI_WIDTH_NODE_ID", "5")
COMFYUI_HEIGHT_NODE_ID = os.getenv("COMFYUI_HEIGHT_NODE_ID", "5")
COMFYUI_BATCH_NODE_ID = os.getenv("COMFYUI_BATCH_NODE_ID", "5")
COMFYUI_OUTPUT_NODE_ID = os.getenv("COMFYUI_OUTPUT_NODE_ID", "9")

_comfy_process = None
_adapter_process = None


def _wait_for(url: str, timeout_s: int) -> None:
    started = time.time()
    while time.time() - started < timeout_s:
        try:
            response = requests.get(url, timeout=5)
            if response.ok:
                return
        except requests.RequestException:
            pass
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {url}")


def _ensure_layout() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    if not REPO_ROOT.exists():
      raise RuntimeError(f"Expected repo checkout at {REPO_ROOT}")
    if not COMFY_ROOT.exists():
      raise RuntimeError(f"Expected ComfyUI checkout at {COMFY_ROOT}")

    source_workflow = REPO_ROOT / ".runpod" / "comfy-workflow.json"
    if not WORKFLOW_PATH.exists():
        WORKFLOW_PATH.write_text(source_workflow.read_text())


def _ensure_checkpoint() -> None:
    target = CHECKPOINT_DIR / MODEL_FILE
    if not target.exists():
        hf_hub_download(
            repo_id=MODEL_REPO,
            filename=MODEL_FILE,
            local_dir=str(CHECKPOINT_DIR),
        )

    alias = CHECKPOINT_DIR / MODEL_ALIAS
    if alias.exists() or alias.is_symlink():
        alias.unlink()
    alias.symlink_to(target)


def _ensure_comfy() -> None:
    global _comfy_process
    if _comfy_process and _comfy_process.poll() is None:
        return

    log_file = open(LOG_DIR / "comfyui.log", "a")
    _comfy_process = subprocess.Popen(
        ["bash", "-lc", f"cd {COMFY_ROOT} && . .venv/bin/activate && python main.py --listen {HOST} --port {COMFY_PORT}"],
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    _wait_for(f"http://127.0.0.1:{COMFY_PORT}/system_stats", 240)


def _ensure_adapter() -> None:
    global _adapter_process
    if _adapter_process and _adapter_process.poll() is None:
        return

    env = os.environ.copy()
    env.update(
        {
            "COMFYUI_BASE_URL": f"http://127.0.0.1:{COMFY_PORT}",
            "COMFY_WORKFLOW_PATH": str(WORKFLOW_PATH),
            "COMFYUI_WORKFLOW_PATH": str(WORKFLOW_PATH),
            "COMFYUI_POSITIVE_NODE_ID": COMFYUI_POSITIVE_NODE_ID,
            "COMFYUI_NEGATIVE_NODE_ID": COMFYUI_NEGATIVE_NODE_ID,
            "COMFYUI_SEED_NODE_ID": COMFYUI_SEED_NODE_ID,
            "COMFYUI_WIDTH_NODE_ID": COMFYUI_WIDTH_NODE_ID,
            "COMFYUI_HEIGHT_NODE_ID": COMFYUI_HEIGHT_NODE_ID,
            "COMFYUI_BATCH_NODE_ID": COMFYUI_BATCH_NODE_ID,
            "COMFYUI_OUTPUT_NODE_ID": COMFYUI_OUTPUT_NODE_ID,
            "PORT": str(ADAPTER_PORT),
            "HOST": HOST,
        }
    )

    log_file = open(LOG_DIR / "comfy-adapter.log", "a")
    _adapter_process = subprocess.Popen(
        ["node", str(REPO_ROOT / "preview-worker" / "comfyui-adapter.js")],
        env=env,
        cwd=str(REPO_ROOT),
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    _wait_for(f"http://127.0.0.1:{ADAPTER_PORT}/health", 60)


def _bootstrap() -> None:
    _ensure_layout()
    _ensure_checkpoint()
    _ensure_comfy()
    _ensure_adapter()


def handler(job):
    _bootstrap()
    payload = job.get("input", {})
    response = requests.post(
        f"http://127.0.0.1:{ADAPTER_PORT}/preview",
        json=payload,
        timeout=600,
    )
    response.raise_for_status()
    return response.json()


runpod.serverless.start({"handler": handler})
