import test from 'node:test';
import assert from 'node:assert/strict';
import { createMvpRuntime } from '../packages/orchestration/src/index.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('newer edits cancel stale preview work', async () => {
  const runtime = createMvpRuntime({ previewStepMs: 10, refineStepMs: 10, upscaleStepMs: 10 });
  const { session } = runtime.createSession('session_12345678');
  const delivered = [];

  runtime.joinSession(session.sessionId, {
    send(serialized) {
      delivered.push(JSON.parse(serialized));
    }
  });

  runtime.requestPreview(session.sessionId, { burstCount: 4 });
  await wait(12);
  runtime.applyCanvasEvent(session.sessionId, { type: 'prompt.update', positive: 'Change the skyline', negative: '' });
  await wait(80);

  const partials = delivered.filter((message) => message.type === 'preview.partial');
  const canceled = delivered.filter((message) => message.type === 'job.canceled');

  assert.ok(partials.length >= 1 && partials.length < 4, 'expected stale preview to be interrupted');
  assert.ok(canceled.some((message) => message.payload.reason.includes('superseded')));
});

test('runtime maps worker preview variants by ordinal and preserves worker metadata', async () => {
  const runtime = createMvpRuntime({
    workerClients: {
      requestPreview() {
        return {
          serviceId: 'preview-worker',
          queue: 'preview',
          provider: { mode: 'real', providerId: 'stub-http' },
          variants: [
            {
              variantId: 'remote_v3',
              ordinal: 2,
              seed: 203,
              mimeType: 'image/png',
              uri: 'data:image/png;base64,cmVtb3RlLTM=',
              metadata: { sourceOrdinal: 2 }
            },
            {
              variantId: 'remote_v1',
              ordinal: 0,
              seed: 201,
              mimeType: 'image/png',
              uri: 'data:image/png;base64,cmVtb3RlLTE=',
              metadata: { sourceOrdinal: 0 }
            }
          ]
        };
      },
      requestRefine() {
        return null;
      },
      requestUpscale() {
        return null;
      }
    }
  });
  const { session } = runtime.createSession('session_remote_preview');
  const delivered = [];

  runtime.joinSession(session.sessionId, {
    send(serialized) {
      delivered.push(JSON.parse(serialized));
    }
  });

  runtime.requestPreview(session.sessionId, { burstCount: 3 });
  await runtime.queues.previewQueue.waitForIdle();

  const partials = delivered.filter((message) => message.type === 'preview.partial');
  assert.equal(partials.length, 3);
  assert.deepEqual(partials.map((message) => message.payload.ordinal), [0, 1, 2]);
  assert.equal(partials[0].payload.variantId, 'remote_v1');
  assert.match(partials[0].payload.uri, /^data:image\/png;base64,/);
  assert.match(partials[1].payload.uri, /^data:image\/svg\+xml/);
  assert.equal(partials[2].payload.variantId, 'remote_v3');

  const asset = runtime.getAsset(partials[0].payload.assetId);
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.metadata.serviceId, 'preview-worker');
  assert.equal(asset.metadata.provider.mode, 'real');
  assert.deepEqual(asset.metadata.workerVariant, { sourceOrdinal: 0 });
});
