import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComfyUiAdapterServer, createComfyUiPreviewResponse } from '../packages/deployment/src/comfyui-preview-adapter.js';

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function startMockComfyServer() {
  const requests = [];
  const pngBuffer = Buffer.from('mock-png');
  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/prompt') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      json(response, 200, { prompt_id: 'prompt_123' });
      return;
    }

    if (request.method === 'GET' && request.url === '/history/prompt_123') {
      json(response, 200, {
        prompt_123: {
          outputs: {
            '9': {
              images: [
                { filename: 'preview-1.png', subfolder: '', type: 'output' },
                { filename: 'preview-2.png', subfolder: '', type: 'output' }
              ]
            }
          }
        }
      });
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/view?')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(pngBuffer);
      return;
    }

    json(response, 404, { error: 'not found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    requests,
    pngBuffer,
    url: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

test('comfyui preview response mutates workflow and returns image data URIs', async () => {
  const mockComfy = await startMockComfyServer();

  try {
    const response = await createComfyUiPreviewResponse({
      baseUrl: mockComfy.url,
      workflowTemplate: {
        '3': { class_type: 'KSampler', inputs: { seed: 1 } },
        '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
        '6': { class_type: 'CLIPTextEncode', inputs: { text: 'old positive' } },
        '7': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative' } },
        '9': { class_type: 'SaveImage', inputs: {} }
      },
      job: {
        jobId: 'preview_job_1',
        sessionId: 'session_12345678',
        sessionVersion: 2,
        burstCount: 2,
        audioPositionMs: 4200,
        roi: { width: 768, height: 768 },
        prompt: { positive: 'Ocean cliffs', negative: 'blurry' }
      },
      config: {
        positiveNodeId: '6',
        negativeNodeId: '7',
        seedNodeId: '3',
        widthNodeId: '5',
        heightNodeId: '5',
        batchNodeId: '5',
        outputNodeId: '9',
        positiveInputName: 'text',
        negativeInputName: 'text',
        seedInputName: 'seed',
        widthInputName: 'width',
        heightInputName: 'height',
        batchInputName: 'batch_size',
        pollIntervalMs: 5,
        historyTimeoutMs: 1000,
        modelLabel: 'sdxl-turbo-comfy',
      }
    });

    assert.equal(response.providerId, 'comfyui');
    assert.equal(response.model, 'sdxl-turbo-comfy');
    assert.equal(response.images.length, 2);
    assert.match(response.images[0].image_url, /^data:image\/png;base64,/);
    assert.equal(response.images[0].audio_position_ms, 4200);
    assert.equal(mockComfy.requests.length, 1);
    assert.equal(mockComfy.requests[0].prompt['6'].inputs.text, 'Ocean cliffs');
    assert.equal(mockComfy.requests[0].prompt['7'].inputs.text, 'blurry');
    assert.equal(mockComfy.requests[0].prompt['5'].inputs.width, 768);
    assert.equal(mockComfy.requests[0].prompt['5'].inputs.height, 768);
    assert.equal(mockComfy.requests[0].prompt['5'].inputs.batch_size, 2);
  } finally {
    await mockComfy.stop();
  }
});

test('comfyui adapter server exposes health and preview endpoints', async () => {
  const mockComfy = await startMockComfyServer();
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'kreaklone-comfy-workflow-'));
  const workflowPath = join(fixtureRoot, 'workflow.json');
  await writeFile(workflowPath, JSON.stringify({
    '3': { class_type: 'KSampler', inputs: { seed: 1 } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'old positive' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative' } },
    '9': { class_type: 'SaveImage', inputs: {} }
  }), 'utf8');

  const adapter = await createComfyUiAdapterServer({
    port: 0,
    host: '127.0.0.1',
    env: {
      COMFYUI_BASE_URL: mockComfy.url,
      COMFYUI_WORKFLOW_PATH: workflowPath,
      COMFYUI_POSITIVE_NODE_ID: '6',
      COMFYUI_NEGATIVE_NODE_ID: '7',
      COMFYUI_SEED_NODE_ID: '3',
      COMFYUI_WIDTH_NODE_ID: '5',
      COMFYUI_HEIGHT_NODE_ID: '5',
      COMFYUI_BATCH_NODE_ID: '5',
      COMFYUI_OUTPUT_NODE_ID: '9',
    }
  });
  const baseUrl = await adapter.start();

  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(healthPayload.providerId, 'comfyui');

    const previewResponse = await fetch(`${baseUrl}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        job: {
          jobId: 'preview_job_2',
          sessionId: 'session_12345678',
          sessionVersion: 3,
          burstCount: 2,
          roi: { width: 640, height: 640 },
          prompt: { positive: 'Golden city', negative: '' }
        }
      })
    });
    const previewPayload = await previewResponse.json();
    assert.equal(previewResponse.status, 200);
    assert.equal(previewPayload.images.length, 2);
  } finally {
    await adapter.stop();
    await mockComfy.stop();
  }
});
