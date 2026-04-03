import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../apps/server/src/server.js';
import { createWorkerService } from '../packages/deployment/src/index.js';
import { previewWorkerManifest } from '../preview-worker/index.js';
import { refineWorkerManifest } from '../refine-worker/index.js';
import { upscaleWorkerManifest } from '../upscale-worker/index.js';

function waitFor(socket, type, predicate = () => true, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.type === type && predicate(message.payload)) {
        clearTimeout(timer);
        socket.removeEventListener('message', onMessage);
        resolve(message);
      }
    }

    socket.addEventListener('message', onMessage);
  });
}

test('http + websocket scaffold supports session join and progressive previews', async () => {
  const previewService = createWorkerService(previewWorkerManifest, { port: 0 });
  const refineService = createWorkerService(refineWorkerManifest, { port: 0 });
  const upscaleService = createWorkerService(upscaleWorkerManifest, { port: 0 });
  const [previewUrl, refineUrl, upscaleUrl] = await Promise.all([
    previewService.start(),
    refineService.start(),
    upscaleService.start()
  ]);
  const app = createAppServer({
    port: 0,
    host: '127.0.0.1'
  });
  process.env.PREVIEW_WORKER_URL = previewUrl;
  process.env.REFINE_WORKER_URL = refineUrl;
  process.env.UPSCALE_WORKER_URL = upscaleUrl;
  const baseUrl = await app.start();

  try {
    const sessionResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const sessionPayload = await sessionResponse.json();
    assert.equal(sessionResponse.status, 201);

    const benchmarksResponse = await fetch(`${baseUrl}/api/benchmarks`);
    const benchmarksPayload = await benchmarksResponse.json();
    assert.equal(benchmarksResponse.status, 200);
    assert.equal(benchmarksPayload.deploymentScaffold.requiredDirectories.includes('preview-worker'), true);

    const socket = new WebSocket(baseUrl.replace('http', 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    socket.send(JSON.stringify({ type: 'session.join', payload: { sessionId: sessionPayload.session.sessionId } }));
    await waitFor(socket, 'session.state', (payload) => payload.sessionId === sessionPayload.session.sessionId);

    const startedPromise = waitFor(socket, 'preview.started');
    const completedPromise = waitFor(socket, 'preview.completed');

    socket.send(JSON.stringify({ type: 'preview.request', payload: { sessionId: sessionPayload.session.sessionId, burstCount: 4 } }));

    await startedPromise;
    const partials = [];
    while (partials.length < 4) {
      partials.push(await waitFor(socket, 'preview.partial', (payload) => !partials.some((entry) => entry.payload.variantId === payload.variantId)));
    }
    const completed = await completedPromise;

    assert.equal(partials.length, 4);
    assert.equal(completed.payload.totalVariants, 4);

    await new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true });
      socket.close();
    });
  } finally {
    await app.stop();
    await Promise.all([previewService.stop(), refineService.stop(), upscaleService.stop()]);
    delete process.env.PREVIEW_WORKER_URL;
    delete process.env.REFINE_WORKER_URL;
    delete process.env.UPSCALE_WORKER_URL;
  }
});
