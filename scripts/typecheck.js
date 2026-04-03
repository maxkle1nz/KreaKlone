import assert from 'node:assert/strict';
import { createBenchmarkCatalog } from '../packages/benchmark/src/scenarios.js';
import { createDeploymentScaffoldManifest } from '../packages/deployment/src/scaffold.js';
import { createQueues } from '../packages/queues/src/lanes.js';
import { CLIENT_EVENT_TYPES, SERVER_EVENT_TYPES, QUEUE_NAMES } from '../packages/shared/src/contracts.js';
import { createMvpRuntime } from '../packages/orchestration/src/index.js';

const runtime = createMvpRuntime({ previewStepMs: 1, refineStepMs: 1, upscaleStepMs: 1 });
const catalog = createBenchmarkCatalog();
const deployment = createDeploymentScaffoldManifest();
const queues = createQueues({
  preview: async () => undefined,
  refine: async () => undefined,
  upscale: async () => undefined
});

assert.equal(QUEUE_NAMES.length, 3);
assert.deepEqual(CLIENT_EVENT_TYPES, ['session.join', 'canvas.event', 'preview.request', 'preview.cancel']);
assert.equal(SERVER_EVENT_TYPES[0], 'session.state');
assert.equal(catalog.scenarios.length, 6);
assert.equal(catalog.runbook.length, 6);
assert.equal(deployment.requiredDirectories.includes('preview-worker'), true);
assert.equal(typeof queues.previewQueue.enqueue, 'function');
assert.equal(typeof runtime.requestPreview, 'function');
console.log('typecheck: structural contracts ok');
