import { createWorkerService, defineWorkerManifest } from '../packages/deployment/src/index.js';

export const upscaleWorkerManifest = defineWorkerManifest({
  serviceId: 'upscale-worker',
  displayName: 'Upscale Worker',
  queue: 'upscale',
  role: 'Detached async upscale lane for accepted results only.',
  models: ['project-selected-upscale'],
  gpuTargets: ['L4', 'RTX 4090'],
  keepWarm: false,
  priority: 'low',
  benchmarkScenarios: ['B6']
});

export const upscaleWorkerService = createWorkerService(upscaleWorkerManifest, {
  port: Number.parseInt(process.env.PORT ?? '4103', 10),
  host: process.env.HOST ?? '127.0.0.1'
});

if (import.meta.url === `file://${process.argv[1]}`) {
  upscaleWorkerService.start().then((url) => {
    process.stdout.write(`Upscale worker scaffold listening on ${url}\n`);
  });
}
