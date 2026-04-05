import test from 'node:test';
import assert from 'node:assert/strict';
import { appendPendingClientMessage, pendingMessageCoalescingKey, replacePendingClientMessages } from '../packages/shared/src/pending-client-messages.js';

test('pending client messages coalesce prompt updates and preview requests to the latest intent', () => {
  const queue = [];

  const withPrompt = appendPendingClientMessage(queue, {
    type: 'canvas.event',
    payload: {
      sessionId: 'session_12345678',
      event: { type: 'prompt.update', positive: 'first', negative: '' }
    }
  });
  const withSecondPrompt = appendPendingClientMessage(withPrompt, {
    type: 'canvas.event',
    payload: {
      sessionId: 'session_12345678',
      event: { type: 'prompt.update', positive: 'second', negative: 'blur' }
    }
  });
  const withPreview = appendPendingClientMessage(withSecondPrompt, {
    type: 'preview.request',
    payload: { sessionId: 'session_12345678', burstCount: 2 }
  });
  const withSecondPreview = appendPendingClientMessage(withPreview, {
    type: 'preview.request',
    payload: { sessionId: 'session_12345678', burstCount: 8, audioPositionMs: 1440 }
  });

  assert.equal(withSecondPreview.length, 2);
  assert.equal(withSecondPreview[0].payload.event.positive, 'second');
  assert.equal(withSecondPreview[1].payload.burstCount, 8);
  assert.equal(withSecondPreview[1].payload.audioPositionMs, 1440);
});

test('pending client messages coalesce timeline playback and loop commands by control lane', () => {
  const queue = [];

  const withPlay = appendPendingClientMessage(queue, {
    type: 'timeline.play',
    payload: { sessionId: 'session_12345678' }
  });
  const withPause = appendPendingClientMessage(withPlay, {
    type: 'timeline.pause',
    payload: { sessionId: 'session_12345678' }
  });
  const withLoopSet = appendPendingClientMessage(withPause, {
    type: 'timeline.loop.set',
    payload: { sessionId: 'session_12345678', startFrameId: 'frame_a', endFrameId: 'frame_b' }
  });
  const withLoopClear = appendPendingClientMessage(withLoopSet, {
    type: 'timeline.loop.clear',
    payload: { sessionId: 'session_12345678' }
  });

  assert.deepEqual(withLoopClear.map((message) => message.type), ['timeline.pause', 'timeline.loop.clear']);
});

test('pending client messages preserve non-coalesced actions', () => {
  const queue = appendPendingClientMessage([], {
    type: 'timeline.pin',
    payload: { sessionId: 'session_12345678', frameId: 'frame_1' }
  });
  const nextQueue = appendPendingClientMessage(queue, {
    type: 'timeline.delete',
    payload: { sessionId: 'session_12345678', frameId: 'frame_2' }
  });

  assert.equal(nextQueue.length, 2);
  assert.deepEqual(nextQueue.map((message) => message.type), ['timeline.pin', 'timeline.delete']);
  assert.equal(pendingMessageCoalescingKey(nextQueue[0]), null);
});

test('pending client cancel replaces queued replay actions', () => {
  const queued = appendPendingClientMessage([], {
    type: 'preview.request',
    payload: { sessionId: 'session_12345678', burstCount: 4 }
  });
  const withPrompt = appendPendingClientMessage(queued, {
    type: 'canvas.event',
    payload: {
      sessionId: 'session_12345678',
      event: { type: 'prompt.update', positive: 'keep', negative: '' }
    }
  });

  const canceled = replacePendingClientMessages({
    type: 'preview.cancel',
    payload: { sessionId: 'session_12345678', queue: 'all' }
  });

  assert.equal(withPrompt.length, 2);
  assert.deepEqual(canceled, [{
    type: 'preview.cancel',
    payload: { sessionId: 'session_12345678', queue: 'all' }
  }]);
});
