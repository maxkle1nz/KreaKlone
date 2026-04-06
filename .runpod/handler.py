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
COMFY_VENV = COMFY_ROOT / ".venv"
COMFY_SETUP_MARKER = COMFY_ROOT / ".kreaklone_bootstrap_complete"

COMFY_PORT = int(os.getenv("COMFY_PORT", "8188"))
ADAPTER_PORT = int(os.getenv("ADAPTER_PORT", "8189"))
HOST = os.getenv("HOST", "0.0.0.0")
WORKER_BACKEND_MODE = os.getenv("WORKER_BACKEND_MODE", "comfyui").strip().lower()

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


def _create_svg_data_uri(title: str, subtitle: str, body_lines: list[str] | None = None) -> str:
    body_lines = body_lines or []
    safe_lines = [str(line).replace("<", "").replace(">", "") for line in body_lines if line]
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
      <rect width="768" height="768" rx="48" fill="#0f172a" />
      <rect x="32" y="32" width="704" height="704" rx="36" fill="none" stroke="#38bdf8" stroke-width="4" stroke-dasharray="14 12" />
      <text x="56" y="110" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700">{title}</text>
      <text x="56" y="156" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="22">{subtitle}</text>
      {"".join(f'<text x="56" y="{240 + index * 38}" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="24">{line}</text>' for index, line in enumerate(safe_lines))}
    </svg>
    """
    from urllib.parse import quote
    return f"data:image/svg+xml;charset=utf-8,{quote(svg)}"


def _synthetic_preview_response(job: dict) -> dict:
    burst_count = job.get("burstCount") if isinstance(job.get("burstCount"), int) else 1
    return {
        "providerId": "synthetic",
        "model": "synthetic-preview",
        "images": [
            {
                "id": f"{job.get('jobId', 'job')}_{index + 1}",
                "seed": job.get("sessionVersion", 0) * 1000 + index + 1,
                "audio_position_ms": job.get("audioPositionMs"),
                "mime_type": "image/svg+xml",
                "image_url": _create_svg_data_uri(
                    f"Synthetic preview {index + 1}/{burst_count}",
                    str(job.get("prompt", {}).get("positive", "preview"))[:64],
                    [f"session: {job.get('sessionId', 'unknown')}"],
                ),
            }
            for index in range(max(1, min(16, burst_count)))
        ],
    }


def _run(command: str, cwd: Path | None = None, env: dict | None = None) -> None:
    subprocess.run(
        ["bash", "-lc", command],
        cwd=str(cwd) if cwd else None,
        env=env,
        check=True,
    )


def _prepare_filtered_requirements() -> Path:
    filtered = WORKSPACE / "comfy-requirements.filtered.txt"
    source = COMFY_ROOT / "requirements.txt"
    filtered_lines = [
        line
        for line in source.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith(("torch", "torchvision", "torchaudio"))
    ]
    filtered.write_text("\n".join(filtered_lines) + "\n")
    return filtered


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
    if not REPO_ROOT.exists():
        raise RuntimeError(f"Expected repo checkout at {REPO_ROOT}")
    if not (COMFY_ROOT / "requirements.txt").exists():
        _run("git clone https://github.com/comfyanonymous/ComfyUI.git /workspace/ComfyUI")
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

    source_workflow = REPO_ROOT / ".runpod" / "comfy-workflow.json"
    if not WORKFLOW_PATH.exists():
        WORKFLOW_PATH.write_text(source_workflow.read_text())


def _ensure_comfy_runtime() -> None:
    if COMFY_SETUP_MARKER.exists():
        return

    _run(f"python3 -m venv {COMFY_VENV}")
    _run(f". {COMFY_VENV}/bin/activate && python -m pip install --upgrade pip requests huggingface_hub")
    _run(
        f". {COMFY_VENV}/bin/activate && "
        "python -m pip install --progress-bar off "
        "torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 "
        "--index-url https://download.pytorch.org/whl/cu124"
    )
    filtered_requirements = _prepare_filtered_requirements()
    _run(f". {COMFY_VENV}/bin/activate && python -m pip install --progress-bar off -r {filtered_requirements}")
    COMFY_SETUP_MARKER.write_text("ok")


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

    _ensure_comfy_runtime()
    log_file = open(LOG_DIR / "comfyui.log", "a")
    _comfy_process = subprocess.Popen(
        ["bash", "-lc", f"cd {COMFY_ROOT} && . {COMFY_VENV}/bin/activate && python main.py --listen {HOST} --port {COMFY_PORT}"],
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
    if WORKER_BACKEND_MODE == "synthetic":
        return
    _ensure_layout()
    _ensure_checkpoint()
    _ensure_comfy()
    _ensure_adapter()


def handler(job):
    if WORKER_BACKEND_MODE == "synthetic":
        return _synthetic_preview_response(job.get("input", {}).get("job", {}))

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
