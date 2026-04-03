import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerService } from '../packages/deployment/src/index.js';
import { previewWorkerManifest } from '../preview-worker/index.js';

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
      body: JSON.stringify({
        job: {
          jobId: 'preview_job_1',
          sessionId: 'session_12345678',
          sessionVersion: 2,
          roi: { x: 0, y: 0, width: 768, height: 768 },
          previewModel: 'sdxl-turbo',
          burstCount: 4
        }
      })
    });
    const payload = await response.json();
    assert.equal(response.status, 202);
    assert.equal(payload.variants.length, 4);
    assert.equal(payload.queue, 'preview');
  } finally {
    await service.stop();
  }
});
