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
