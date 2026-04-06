FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /workspace/repo

COPY package.json ./package.json
COPY packages ./packages
COPY preview-worker ./preview-worker
COPY .runpod /workspace/repo/.runpod

RUN apt-get update \
  && apt-get install -y curl ca-certificates gnupg git python3-venv \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y nodejs \
  && python3 -m pip install --upgrade pip runpod requests huggingface_hub \
  && rm -rf /var/lib/apt/lists/*

CMD ["python3", "/workspace/repo/.runpod/handler.py"]
