import { createWorkerService, defineWorkerManifest } from '../packages/deployment/src/index.js';

export const refineWorkerManifest = defineWorkerManifest({
  serviceId: 'refine-worker',
  displayName: 'Refine Worker',
  queue: 'refine',
  role: 'Lower-priority semantic refine lane for selected variants.',
  models: ['Qwen-Image-Edit', 'FLUX Kontext'],
  gpuTargets: ['L4', 'RTX 4090'],
  keepWarm: false,
  priority: 'medium',
  benchmarkScenarios: ['B5']
});

export const refineWorkerService = createWorkerService(refineWorkerManifest, {
  port: Number.parseInt(process.env.PORT ?? '4102', 10),
  host: process.env.HOST ?? '127.0.0.1'
});

if (import.meta.url === `file://${process.argv[1]}`) {
  refineWorkerService.start().then((url) => {
    process.stdout.write(`Refine worker scaffold listening on ${url}\n`);
  });
}
