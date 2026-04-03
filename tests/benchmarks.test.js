import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARK_SCENARIOS, createBenchmarkCatalog } from '../packages/benchmark/src/scenarios.js';

test('benchmark catalog includes documented B1-B6 scenarios', () => {
  const catalog = createBenchmarkCatalog();
  assert.deepEqual(BENCHMARK_SCENARIOS.map((scenario) => scenario.id), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  assert.equal(catalog.metrics.includes('preview_first_ms'), true);
  assert.equal(catalog.captureFields.includes('time_to_first_preview_ms'), true);
  assert.equal(catalog.deployment.primaryGpu, 'RTX 4090');
  assert.equal(catalog.deploymentScaffold.requiredDirectories.includes('preview-worker'), true);
  assert.equal(catalog.runbook.length, 6);
});
