import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function encodeViewQuery(image) {
  const params = new URLSearchParams();
  params.set('filename', image.filename);
  params.set('type', image.type ?? 'output');
  if (image.subfolder) {
    params.set('subfolder', image.subfolder);
  }
  return params.toString();
}

function normalizeImageMimeType(contentType) {
  if (typeof contentType === 'string' && contentType.startsWith('image/')) {
    return contentType;
  }
  return 'image/png';
}

function imageBufferToDataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? `${url} failed with status ${response.status}`);
  }
  return payload;
}

function getNode(workflow, nodeId, label) {
  const node = workflow?.[nodeId];
  invariant(node && typeof node === 'object', `${label} node ${nodeId} not found in workflow`);
  node.inputs ??= {};
  return node;
}

function setNodeInput(workflow, nodeId, inputName, value, label) {
  if (!nodeId || !inputName || value === undefined || value === null) {
    return;
  }
  const node = getNode(workflow, nodeId, label);
  node.inputs[inputName] = value;
}

function cloneWorkflowTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

function normalizeBurstCount(burstCount) {
  if (!Number.isInteger(burstCount)) {
    return 1;
  }
  return Math.max(1, Math.min(16, burstCount));
}

function collectOutputImages(historyPayload, promptId, outputNodeId) {
  const promptOutputs = historyPayload?.[promptId]?.outputs;
  invariant(promptOutputs && typeof promptOutputs === 'object', 'ComfyUI history did not contain outputs for prompt');

  if (outputNodeId) {
    const selected = promptOutputs[outputNodeId]?.images;
    invariant(Array.isArray(selected) && selected.length > 0, `ComfyUI output node ${outputNodeId} produced no images`);
    return selected;
  }

  const images = Object.values(promptOutputs).flatMap((output) => Array.isArray(output?.images) ? output.images : []);
  invariant(images.length > 0, 'ComfyUI history produced no images');
  return images;
}

async function waitForHistory(baseUrl, promptId, timeoutMs, pollIntervalMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const payload = await fetchJson(new URL(`/history/${promptId}`, baseUrl).toString());
    if (payload?.[promptId]?.outputs) {
      return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for ComfyUI history for prompt ${promptId}`);
}

export async function createComfyUiPreviewResponse({
  baseUrl,
  workflowTemplate,
  job,
  config,
  fetchImpl = fetch,
}) {
  const workflow = cloneWorkflowTemplate(workflowTemplate);
  const burstCount = normalizeBurstCount(job.burstCount);

  setNodeInput(workflow, config.positiveNodeId, config.positiveInputName, job.prompt?.positive ?? '', 'positive prompt');
  setNodeInput(workflow, config.negativeNodeId, config.negativeInputName, job.prompt?.negative ?? '', 'negative prompt');
  setNodeInput(workflow, config.seedNodeId, config.seedInputName, job.sessionVersion * 1000 + 1, 'seed');
  setNodeInput(workflow, config.widthNodeId, config.widthInputName, job.roi?.width, 'width');
  setNodeInput(workflow, config.heightNodeId, config.heightInputName, job.roi?.height, 'height');
  setNodeInput(workflow, config.batchNodeId, config.batchInputName, burstCount, 'batch size');

  const clientId = config.clientId ?? `kreaklone_${randomUUID()}`;
  const promptPayload = await fetchJson(new URL('/prompt', baseUrl).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  const promptId = promptPayload.prompt_id ?? promptPayload.promptId;
  invariant(typeof promptId === 'string' && promptId.length > 0, 'ComfyUI did not return a prompt_id');

  const historyPayload = await waitForHistory(baseUrl, promptId, config.historyTimeoutMs, config.pollIntervalMs);
  const images = collectOutputImages(historyPayload, promptId, config.outputNodeId).slice(0, burstCount);

  const variants = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const response = await fetchImpl(new URL(`/view?${encodeViewQuery(image)}`, baseUrl).toString());
    if (!response.ok) {
      throw new Error(`ComfyUI view failed with status ${response.status}`);
    }
    const mimeType = normalizeImageMimeType(response.headers.get('content-type'));
    const buffer = Buffer.from(await response.arrayBuffer());
    variants.push({
      id: `${promptId}_${index + 1}`,
      seed: job.sessionVersion * 1000 + index + 1,
      audio_position_ms: job.audioPositionMs ?? null,
      mime_type: mimeType,
      image_url: imageBufferToDataUri(buffer, mimeType)
    });
  }

  return {
    providerId: 'comfyui',
    model: config.modelLabel ?? 'comfyui-workflow',
    images: variants
  };
}

export async function loadComfyUiWorkflowTemplate(filePath) {
  invariant(typeof filePath === 'string' && filePath.length > 0, 'COMFYUI_WORKFLOW_PATH is required');
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function createComfyUiAdapterConfig(env = process.env) {
  return {
    baseUrl: env.COMFYUI_BASE_URL ?? 'http://127.0.0.1:8188',
    workflowPath: env.COMFYUI_WORKFLOW_PATH,
    apiKey: env.COMFYUI_API_KEY,
    clientId: env.COMFYUI_CLIENT_ID,
    modelLabel: env.COMFYUI_MODEL_LABEL ?? 'comfyui-workflow',
    positiveNodeId: env.COMFYUI_POSITIVE_NODE_ID,
    positiveInputName: env.COMFYUI_POSITIVE_INPUT_NAME ?? 'text',
    negativeNodeId: env.COMFYUI_NEGATIVE_NODE_ID,
    negativeInputName: env.COMFYUI_NEGATIVE_INPUT_NAME ?? 'text',
    seedNodeId: env.COMFYUI_SEED_NODE_ID,
    seedInputName: env.COMFYUI_SEED_INPUT_NAME ?? 'seed',
    widthNodeId: env.COMFYUI_WIDTH_NODE_ID,
    widthInputName: env.COMFYUI_WIDTH_INPUT_NAME ?? 'width',
    heightNodeId: env.COMFYUI_HEIGHT_NODE_ID,
    heightInputName: env.COMFYUI_HEIGHT_INPUT_NAME ?? 'height',
    batchNodeId: env.COMFYUI_BATCH_NODE_ID,
    batchInputName: env.COMFYUI_BATCH_INPUT_NAME ?? 'batch_size',
    outputNodeId: env.COMFYUI_OUTPUT_NODE_ID,
    pollIntervalMs: Number.parseInt(env.COMFYUI_POLL_INTERVAL_MS ?? '800', 10),
    historyTimeoutMs: Number.parseInt(env.COMFYUI_HISTORY_TIMEOUT_MS ?? '120000', 10),
  };
}

export async function createComfyUiAdapterServer({ port = Number.parseInt(process.env.PORT ?? '8189', 10), host = process.env.HOST ?? '127.0.0.1', env = process.env, fetchImpl = fetch } = {}) {
  const config = createComfyUiAdapterConfig(env);
  const workflowTemplate = await loadComfyUiWorkflowTemplate(config.workflowPath);

  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        json(response, 200, {
          ok: true,
          providerId: 'comfyui',
          baseUrl: config.baseUrl,
          workflowPath: config.workflowPath,
          outputNodeId: config.outputNodeId ?? null,
        });
        return;
      }

      if (request.method !== 'POST' || request.url !== '/preview') {
        json(response, 404, { error: 'not found' });
        return;
      }

      const payload = await readJsonBody(request);
      const result = await createComfyUiPreviewResponse({
        baseUrl: config.baseUrl,
        workflowTemplate,
        job: payload.job ?? {},
        config,
        fetchImpl,
      });
      json(response, 200, result);
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : 'unknown error' });
    }
  });

  return {
    host,
    port,
    async start() {
      await new Promise((resolve) => server.listen(port, host, resolve));
      return `http://${host}:${server.address().port}`;
    },
    async stop() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
