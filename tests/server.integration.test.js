import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../apps/server/src/server.js';
import { createRealPreviewProvider, createWorkerService } from '../packages/deployment/src/index.js';
import { previewWorkerManifest } from '../preview-worker/index.js';
import { refineWorkerManifest } from '../refine-worker/index.js';
import { upscaleWorkerManifest } from '../upscale-worker/index.js';
import { startRealPreviewAdapter } from './helpers/real-preview-adapter.js';

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

function collectMessages(socket, predicate, expectedCount, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const matches = [];
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for ${expectedCount} matching messages`));
    }, timeoutMs);

    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (!predicate(message, matches)) {
        return;
      }

      matches.push(message);
      if (matches.length === expectedCount) {
        clearTimeout(timer);
        socket.removeEventListener('message', onMessage);
        resolve(matches);
      }
    }

    socket.addEventListener('message', onMessage);
  });
}

async function startWorkerStack({ previewProvider } = {}) {
  const previewService = createWorkerService(previewWorkerManifest, { port: 0, previewProvider });
  const refineService = createWorkerService(refineWorkerManifest, { port: 0 });
  const upscaleService = createWorkerService(upscaleWorkerManifest, { port: 0 });
  const [previewUrl, refineUrl, upscaleUrl] = await Promise.all([
    previewService.start(),
    refineService.start(),
    upscaleService.start()
  ]);

  return {
    previewService,
    refineService,
    upscaleService,
    previewUrl,
    refineUrl,
    upscaleUrl,
    async stop() {
      await Promise.all([previewService.stop(), refineService.stop(), upscaleService.stop()]);
    }
  };
}

async function startAppWithWorkers(workerStack) {
  process.env.PREVIEW_WORKER_URL = workerStack.previewUrl;
  process.env.REFINE_WORKER_URL = workerStack.refineUrl;
  process.env.UPSCALE_WORKER_URL = workerStack.upscaleUrl;
  const app = createAppServer({
    port: 0,
    host: '127.0.0.1'
  });
  const baseUrl = await app.start();

  return {
    app,
    baseUrl,
    async stop() {
      await app.stop();
      delete process.env.PREVIEW_WORKER_URL;
      delete process.env.REFINE_WORKER_URL;
      delete process.env.UPSCALE_WORKER_URL;
    }
  };
}

test('http + websocket scaffold supports session join and progressive previews', async () => {
  const workerStack = await startWorkerStack();
  const appStack = await startAppWithWorkers(workerStack);

  try {
    const sessionResponse = await fetch(`${appStack.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const sessionPayload = await sessionResponse.json();
    assert.equal(sessionResponse.status, 201);

    const benchmarksResponse = await fetch(`${appStack.baseUrl}/api/benchmarks`);
    const benchmarksPayload = await benchmarksResponse.json();
    assert.equal(benchmarksResponse.status, 200);
    assert.equal(benchmarksPayload.deploymentScaffold.requiredDirectories.includes('preview-worker'), true);

    const socket = new WebSocket(appStack.baseUrl.replace('http', 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    socket.send(JSON.stringify({ type: 'session.join', payload: { sessionId: sessionPayload.session.sessionId } }));
    await waitFor(socket, 'session.state', (payload) => payload.sessionId === sessionPayload.session.sessionId);

    const startedPromise = waitFor(socket, 'preview.started');
    const partialsPromise = collectMessages(
      socket,
      (message, matches) => message.type === 'preview.partial' && !matches.some((entry) => entry.payload.variantId === message.payload.variantId),
      4
    );
    const completedPromise = waitFor(socket, 'preview.completed');

    socket.send(JSON.stringify({ type: 'preview.request', payload: { sessionId: sessionPayload.session.sessionId, burstCount: 4 } }));

    await startedPromise;
    const completed = await completedPromise;
    const partials = await partialsPromise;

    assert.equal(partials.length, 4);
    assert.equal(completed.payload.totalVariants, 4);
    const assetResponse = await fetch(`${appStack.baseUrl}/api/assets/${partials[0].payload.assetId}`);
    const assetPayload = await assetResponse.json();
    assert.equal(assetResponse.status, 200);
    assert.equal(assetPayload.metadata.serviceId, 'preview-worker');
    assert.equal(assetPayload.metadata.queue, 'preview');

    await new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true });
      socket.close();
    });
  } finally {
    await appStack.stop();
    await workerStack.stop();
  }
});

test('http + websocket scaffold preserves real preview worker responses through runtime assets', async () => {
  const adapter = await startRealPreviewAdapter();
  const workerStack = await startWorkerStack({
    previewProvider: createRealPreviewProvider({ endpointUrl: adapter.url })
  });
  const appStack = await startAppWithWorkers(workerStack);

  try {
    const sessionResponse = await fetch(`${appStack.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const sessionPayload = await sessionResponse.json();
    assert.equal(sessionResponse.status, 201);

    const socket = new WebSocket(appStack.baseUrl.replace('http', 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    socket.send(JSON.stringify({ type: 'session.join', payload: { sessionId: sessionPayload.session.sessionId } }));
    await waitFor(socket, 'session.state', (payload) => payload.sessionId === sessionPayload.session.sessionId);

    socket.send(JSON.stringify({
      type: 'canvas.event',
      payload: {
        sessionId: sessionPayload.session.sessionId,
        event: { type: 'prompt.update', positive: 'Glass tower at dusk', negative: '' }
      }
    }));
    await waitFor(socket, 'session.state', (payload) => payload.session.prompt.positive === 'Glass tower at dusk');

    const startedPromise = waitFor(socket, 'preview.started');
    const firstPartialPromise = waitFor(socket, 'preview.partial');
    const completedPromise = waitFor(socket, 'preview.completed');

    socket.send(JSON.stringify({ type: 'preview.request', payload: { sessionId: sessionPayload.session.sessionId, burstCount: 4 } }));

    await startedPromise;
    const firstPartial = await firstPartialPromise;
    const completed = await completedPromise;

    assert.match(firstPartial.payload.uri, /^data:image\/png;base64,/);
    assert.equal(completed.payload.totalVariants, 4);
    assert.equal(adapter.requests.length, 1);
    assert.equal(adapter.requests[0].job.prompt.positive, 'Glass tower at dusk');

    const assetResponse = await fetch(`${appStack.baseUrl}/api/assets/${firstPartial.payload.assetId}`);
    const assetPayload = await assetResponse.json();
    assert.equal(assetResponse.status, 200);
    assert.equal(assetPayload.kind, 'preview');
    assert.equal(assetPayload.mimeType, 'image/png');
    assert.equal(assetPayload.uri, firstPartial.payload.uri);
    assert.equal(assetPayload.metadata.serviceId, 'preview-worker');
    assert.equal(assetPayload.metadata.queue, 'preview');
    assert.equal(assetPayload.metadata.provider.mode, 'real');

    await new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true });
      socket.close();
    });
  } finally {
    await appStack.stop();
    await workerStack.stop();
    await adapter.stop();
  }
});

test('worker failures become explicit job.failed events instead of being swallowed', async () => {
  const workerStack = await startWorkerStack({
    previewProvider: {
      describe() {
        return { name: 'real-failing-test' };
      },
      async generatePreview() {
        throw new Error('preview backend unavailable');
      }
    }
  });
  const appStack = await startAppWithWorkers(workerStack);

  try {
    const sessionResponse = await fetch(`${appStack.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const sessionPayload = await sessionResponse.json();

    const socket = new WebSocket(appStack.baseUrl.replace('http', 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    socket.send(JSON.stringify({ type: 'session.join', payload: { sessionId: sessionPayload.session.sessionId } }));
    await waitFor(socket, 'session.state', (payload) => payload.sessionId === sessionPayload.session.sessionId);

    socket.send(JSON.stringify({ type: 'preview.request', payload: { sessionId: sessionPayload.session.sessionId, burstCount: 2 } }));
    const failure = await waitFor(socket, 'job.failed', (payload) => payload.queue === 'preview');
    assert.match(failure.payload.error, /preview backend unavailable/);

    const benchmarksResponse = await fetch(`${appStack.baseUrl}/api/benchmarks`);
    const benchmarksPayload = await benchmarksResponse.json();
    assert.equal(benchmarksPayload.runtimeMetrics.worker_failure_count >= 1, true);

    await new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true });
      socket.close();
    });
  } finally {
    await appStack.stop();
    await workerStack.stop();
  }
});

test('timeline management and session settings endpoints mutate session state', async () => {
  const workerStack = await startWorkerStack();
  const appStack = await startAppWithWorkers(workerStack);

  try {
    const sessionResponse = await fetch(`${appStack.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const sessionPayload = await sessionResponse.json();
    const sessionId = sessionPayload.session.sessionId;

    const socket = new WebSocket(appStack.baseUrl.replace('http', 'ws') + '/ws');
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    socket.send(JSON.stringify({ type: 'session.join', payload: { sessionId } }));
    await waitFor(socket, 'session.state', (payload) => payload.sessionId === sessionId);

    socket.send(JSON.stringify({ type: 'preview.request', payload: { sessionId, burstCount: 3 } }));
    await waitFor(socket, 'preview.completed', (payload) => payload.sessionId === sessionId);

    const stateBefore = appStack.app.runtime.getSession(sessionId);
    const frameId = stateBefore.timelineFrames[0].frameId;

    const capacityResponse = await fetch(`${appStack.baseUrl}/api/sessions/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, frameCapacity: 12 })
    });
    const capacityPayload = await capacityResponse.json();
    assert.equal(capacityResponse.status, 200);
    assert.equal(capacityPayload.session.frameCapacity, 12);

    const pinResponse = await fetch(`${appStack.baseUrl}/api/timeline/pin-frame`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, frameId })
    });
    const pinPayload = await pinResponse.json();
    assert.equal(pinResponse.status, 200);
    assert.equal(pinPayload.session.timelineFrames.some((frame) => frame.frameId === frameId && frame.isPinned === true), true);

    const deleteResponse = await fetch(`${appStack.baseUrl}/api/timeline/delete-frame`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, frameId })
    });
    const deletePayload = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletePayload.session.timelineFrames.some((frame) => frame.frameId === frameId), false);

    const recordResponse = await fetch(`${appStack.baseUrl}/api/record/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, source: 'output' })
    });
    assert.equal(recordResponse.status, 202);

    await new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true });
      socket.close();
    });
  } finally {
    await appStack.stop();
    await workerStack.stop();
  }
});
