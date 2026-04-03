import { createPreviewProviderFromEnv, createWorkerService, defineWorkerManifest } from '../packages/deployment/src/index.js';

export const previewWorkerManifest = defineWorkerManifest({
  serviceId: 'preview-worker',
  displayName: 'Preview Worker',
  queue: 'preview',
  role: 'Warm burst preview lane for prompt, reference, and ROI edits.',
  models: ['SDXL-Turbo', 'FLUX.1-schnell'],
  gpuTargets: ['RTX 4090', 'L4'],
  keepWarm: true,
  priority: 'highest',
  acceleration: ['TensorRT', 'StreamDiffusion'],
  benchmarkScenarios: ['B1', 'B2', 'B3', 'B4']
});

export function createPreviewWorkerService({
  port = Number.parseInt(process.env.PORT ?? '4101', 10),
  host = process.env.HOST ?? '127.0.0.1',
  previewProvider = createPreviewProviderFromEnv({ env: process.env })
} = {}) {
  return createWorkerService(previewWorkerManifest, {
    port,
    host,
    previewProvider
  });
}

export const previewWorkerService = createPreviewWorkerService();

if (import.meta.url === `file://${process.argv[1]}`) {
  previewWorkerService.start().then((url) => {
    process.stdout.write(`Preview worker scaffold listening on ${url}\n`);
  });
}
