import test from 'node:test';
import assert from 'node:assert/strict';
import { appendPendingClientMessage } from '../packages/shared/src/pending-client-messages.js';

test('pending client message queue coalesces replayable transport intents to the latest version', () => {
  let queue = [];

  queue = appendPendingClientMessage(queue, {
    type: 'preview.request',
    payload: { sessionId: 'session_12345678', burstCount: 2 }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'preview.request',
    payload: { sessionId: 'session_12345678', burstCount: 4 }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'canvas.event',
    payload: {
      sessionId: 'session_12345678',
      event: { type: 'prompt.update', positive: 'first', negative: '' }
    }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'canvas.event',
    payload: {
      sessionId: 'session_12345678',
      event: { type: 'prompt.update', positive: 'second', negative: '' }
    }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'timeline.play',
    payload: { sessionId: 'session_12345678' }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'timeline.pause',
    payload: { sessionId: 'session_12345678' }
  });

  assert.equal(queue.length, 3);
  assert.deepEqual(
    queue.map((message) => message.type),
    ['preview.request', 'canvas.event', 'timeline.pause']
  );
  assert.equal(queue[0].payload.burstCount, 4);
  assert.equal(queue[1].payload.event.positive, 'second');
});

test('pending client message queue preserves distinct actions that must still replay after reconnect', () => {
  let queue = [];

  queue = appendPendingClientMessage(queue, {
    type: 'timeline.pin',
    payload: { sessionId: 'session_12345678', frameId: 'frame_a' }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'timeline.delete',
    payload: { sessionId: 'session_12345678', frameId: 'frame_b' }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'timeline.seek',
    payload: { sessionId: 'session_12345678', frameId: 'frame_a' }
  });
  queue = appendPendingClientMessage(queue, {
    type: 'timeline.seek',
    payload: { sessionId: 'session_12345678', frameId: 'frame_b' }
  });

  assert.equal(queue.length, 3);
  assert.deepEqual(
    queue.map((message) => message.type),
    ['timeline.pin', 'timeline.delete', 'timeline.seek']
  );
  assert.equal(queue.at(-1).payload.frameId, 'frame_b');
});
