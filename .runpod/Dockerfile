FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /workspace/repo

COPY package.json ./package.json
COPY packages ./packages
COPY preview-worker ./preview-worker
COPY .runpod /workspace/repo/.runpod

RUN apt-get update \
  && git clone https://github.com/comfyanonymous/ComfyUI.git /workspace/ComfyUI \
  && apt-get install -y curl ca-certificates gnupg git python3-venv \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y nodejs \
  && python3 -m venv /workspace/ComfyUI/.venv \
  && /workspace/ComfyUI/.venv/bin/python -m pip install --upgrade pip runpod requests huggingface_hub \
  && /workspace/ComfyUI/.venv/bin/python -m pip install --progress-bar off torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124 \
  && /workspace/ComfyUI/.venv/bin/python -m pip install --progress-bar off -r /workspace/ComfyUI/requirements.txt \
  && rm -rf /var/lib/apt/lists/*

CMD ["python3", "/workspace/repo/.runpod/handler.py"]
