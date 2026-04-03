import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createDeploymentScaffoldManifest } from '../packages/deployment/src/index.js';

test('deployment scaffold manifest matches required project structure', async () => {
  const manifest = createDeploymentScaffoldManifest();
  assert.equal(manifest.requiredDirectories.length, 5);
  assert.equal(manifest.containerLayout.some((service) => service.serviceId === 'preview-worker'), true);
  assert.equal(manifest.modes.some((mode) => mode.id === 'mode-c'), true);

  await Promise.all(manifest.requiredDirectories.map((directory) => access(directory)));
});
