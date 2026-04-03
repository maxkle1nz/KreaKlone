import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealPreviewProvider, createWorkerService } from '../packages/deployment/src/index.js';
import { previewWorkerManifest } from '../preview-worker/index.js';
import { startRealPreviewAdapter } from './helpers/real-preview-adapter.js';

function createPreviewJob(overrides = {}) {
  return {
    jobId: 'preview_job_1',
    sessionId: 'session_12345678',
    sessionVersion: 2,
    roi: { x: 0, y: 0, width: 768, height: 768 },
    prompt: { positive: 'Sunlit skyline', negative: '' },
    references: [],
    previewModel: 'sdxl-turbo',
    burstCount: 4,
    ...overrides
  };
}

test('preview worker scaffold exposes health and manifest endpoints', async () => {
  const service = createWorkerService(previewWorkerManifest, { port: 0 });
  const baseUrl = await service.start();

  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(healthPayload.serviceId, 'preview-worker');
    assert.equal(healthPayload.keepWarm, true);

    const manifestResponse = await fetch(`${baseUrl}/manifest`);
    const manifestPayload = await manifestResponse.json();
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestPayload.queue, 'preview');
    assert.equal(manifestPayload.routes.includes('/manifest'), true);
  } finally {
    await service.stop();
  }
});

test('preview worker scaffold accepts preview jobs', async () => {
  const service = createWorkerService(previewWorkerManifest, { port: 0 });
  const baseUrl = await service.start();

  try {
    const response = await fetch(`${baseUrl}/jobs/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job: createPreviewJob() })
    });
    const payload = await response.json();
    assert.equal(response.status, 202);
    assert.equal(payload.variants.length, 4);
    assert.equal(payload.queue, 'preview');
    assert.match(payload.variants[0].uri, /^data:image\/svg\+xml/);
  } finally {
    await service.stop();
  }
});

test('preview worker can adapt a real preview provider without changing the HTTP contract', async () => {
  const adapter = await startRealPreviewAdapter();
  const service = createWorkerService(previewWorkerManifest, {
    port: 0,
    previewProvider: createRealPreviewProvider({ endpointUrl: adapter.url })
  });
  const baseUrl = await service.start();

  try {
    const response = await fetch(`${baseUrl}/jobs/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        job: createPreviewJob({
          jobId: 'preview_real_1',
          prompt: { positive: 'Ocean cliffs', negative: 'low quality' }
        })
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 202);
    assert.equal(payload.jobId, 'preview_real_1');
    assert.equal(payload.serviceId, 'preview-worker');
    assert.equal(payload.queue, 'preview');
    assert.equal(payload.variants.length, 4);
    assert.equal(payload.variants[0].mimeType, 'image/png');
    assert.match(payload.variants[0].uri, /^data:image\/png;base64,/);
    assert.equal(payload.provider.mode, 'real');
    assert.equal(adapter.requests.length, 1);
    assert.equal(adapter.requests[0].job.prompt.positive, 'Ocean cliffs');
    assert.equal(adapter.requests[0].manifest.serviceId, 'preview-worker');
  } finally {
    await service.stop();
    await adapter.stop();
  }
});
