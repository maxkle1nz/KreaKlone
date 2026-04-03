import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCanvasEvent, createSessionState } from '../packages/shared/src/session-state.js';

test('session reducer increments version and derives bucketed ROI for brush edits', () => {
  const session = createSessionState('session_12345678');
  const next = applyCanvasEvent(session, {
    type: 'brush',
    strokeId: 'stroke_1',
    layerId: 'base',
    size: 22,
    points: [10, 10, 85, 90, 120, 145, 180, 190]
  });

  assert.equal(next.version, 1);
  assert.equal(next.strokes.length, 1);
  assert.equal(next.activeRoi.width % 64, 0);
  assert.equal(next.activeRoi.height % 64, 0);
});

test('prompt and references survive later edits', () => {
  let session = createSessionState('session_12345678');
  session = applyCanvasEvent(session, { type: 'prompt.update', positive: 'Golden hour skyline', negative: '' });
  session = applyCanvasEvent(session, { type: 'reference.add', assetId: 'asset_1', uri: 'data:image/png;base64,abc' });
  session = applyCanvasEvent(session, { type: 'region.set', x: 24, y: 24, width: 180, height: 190 });

  assert.equal(session.prompt.positive, 'Golden hour skyline');
  assert.deepEqual(session.references, ['asset_1']);
  assert.equal(session.version, 3);
});
