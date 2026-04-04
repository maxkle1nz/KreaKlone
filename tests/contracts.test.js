import test from 'node:test';
import assert from 'node:assert/strict';
import { envelope, validateClientEnvelope, validateServerEnvelope } from '../packages/shared/src/contracts.js';

test('contract validators accept valid envelopes', () => {
  const clientMessage = validateClientEnvelope({
    type: 'canvas.event',
    payload: {
      sessionId: 'session_12345678',
      event: { type: 'prompt.update', positive: 'Add neon lights', negative: 'blurry' }
    }
  });

  const serverMessage = validateServerEnvelope(envelope('preview.partial', {
    jobId: 'preview_job',
    sessionId: 'session_12345678',
    sessionVersion: 2,
    variantId: 'variant_1',
    ordinal: 0,
    seed: 42,
    assetId: 'asset_1',
    uri: 'data:image/svg+xml,preview',
    roi: { x: 0, y: 0, width: 512, height: 512 }
  }));

  assert.equal(clientMessage.type, 'canvas.event');
  assert.equal(serverMessage.type, 'preview.partial');

  const timelineFrame = validateServerEnvelope(envelope('timeline.frame', {
    jobId: 'preview_job',
    sessionId: 'session_12345678',
    sessionVersion: 2,
    frameId: 'frame_1',
    ordinal: 0,
    assetId: 'asset_1',
    uri: 'data:image/svg+xml,frame'
  }));
  assert.equal(timelineFrame.type, 'timeline.frame');

  const recordEvent = validateClientEnvelope({
    type: 'record.start',
    payload: {
      sessionId: 'session_12345678',
      source: 'output'
    }
  });
  assert.equal(recordEvent.type, 'record.start');

  const pinEvent = validateClientEnvelope({
    type: 'timeline.pin',
    payload: {
      sessionId: 'session_12345678',
      frameId: 'frame_1'
    }
  });
  assert.equal(pinEvent.type, 'timeline.pin');
});

test('contract validators reject invalid queue selections', () => {
  assert.throws(
    () => validateClientEnvelope({ type: 'preview.cancel', payload: { sessionId: 'session_12345678', queue: 'invalid' } }),
    /queue must be/
  );
});
