export const REQUIRED_SERVICE_DIRECTORIES = Object.freeze(['app', 'redis', 'preview-worker', 'refine-worker', 'upscale-worker']);

export const GENESIS_DEPLOYMENT_MODES = Object.freeze([
  Object.freeze({
    id: 'mode-a',
    name: 'Cheapest serious launch',
    gpuPlan: ['L4'],
    appHost: 'separate CPU host',
    activeServices: ['app', 'redis', 'preview-worker', 'refine-worker'],
    summary: 'Use one L4 and co-locate preview + refine when simplicity matters more than peak UX.'
  }),
  Object.freeze({
    id: 'mode-b',
    name: 'Best practical launch',
    gpuPlan: ['RTX 4090'],
    appHost: 'separate CPU host',
    activeServices: ['app', 'redis', 'preview-worker', 'refine-worker'],
    summary: 'Start on a 4090 to maximize preview feel per dollar while refine remains on the same worker host.'
  }),
  Object.freeze({
    id: 'mode-c',
    name: 'Better production split',
    gpuPlan: ['RTX 4090', 'L4'],
    appHost: 'separate CPU host',
    activeServices: ['app', 'redis', 'preview-worker', 'refine-worker', 'upscale-worker'],
    summary: 'Isolate preview from refine/upscale pressure once concurrent usage starts to matter.'
  })
]);

export const CONTAINER_LAYOUT = Object.freeze([
  Object.freeze({
    serviceId: 'app',
    directory: 'app',
    runtime: 'node',
    role: 'Frontend server, REST API, and WebSocket gateway',
    hostType: 'cpu-vm',
    ports: [3000],
    queueAffinities: ['preview', 'refine', 'upscale'],
    healthcheck: '/health'
  }),
  Object.freeze({
    serviceId: 'redis',
    directory: 'redis',
    runtime: 'redis',
    role: 'Session versioning and queue coordination scaffold',
    hostType: 'cpu-vm',
    ports: [6379],
    queueAffinities: ['preview', 'refine', 'upscale'],
    healthcheck: 'redis-cli ping'
  }),
  Object.freeze({
    serviceId: 'preview-worker',
    directory: 'preview-worker',
    runtime: 'node scaffold / future python GPU service',
    role: 'Warm SDXL-Turbo preview burst lane',
    hostType: 'gpu',
    ports: [4101],
    queueAffinities: ['preview'],
    defaultGpu: 'RTX 4090',
    fallbackGpu: 'L4',
    models: ['SDXL-Turbo', 'FLUX.1-schnell'],
    acceleration: ['TensorRT', 'StreamDiffusion'],
    keepWarm: true,
    benchmarkScenarios: ['B1', 'B2', 'B3', 'B4'],
    healthcheck: '/health'
  }),
  Object.freeze({
    serviceId: 'refine-worker',
    directory: 'refine-worker',
    runtime: 'node scaffold / future python GPU service',
    role: 'Lower-priority semantic refine lane',
    hostType: 'gpu',
    ports: [4102],
    queueAffinities: ['refine'],
    defaultGpu: 'L4',
    fallbackGpu: 'RTX 4090',
    models: ['Qwen-Image-Edit', 'FLUX Kontext'],
    keepWarm: false,
    benchmarkScenarios: ['B5'],
    healthcheck: '/health'
  }),
  Object.freeze({
    serviceId: 'upscale-worker',
    directory: 'upscale-worker',
    runtime: 'node scaffold / future python GPU service',
    role: 'Detached async upscale lane',
    hostType: 'gpu',
    ports: [4103],
    queueAffinities: ['upscale'],
    defaultGpu: 'L4',
    fallbackGpu: 'RTX 4090',
    models: ['project-selected-upscale'],
    keepWarm: false,
    benchmarkScenarios: ['B6'],
    healthcheck: '/health'
  })
]);

export function createDeploymentScaffoldManifest() {
  return {
    generatedAt: new Date().toISOString(),
    primaryGpu: 'RTX 4090',
    fallbackGpu: 'L4',
    requiredDirectories: REQUIRED_SERVICE_DIRECTORIES,
    containerLayout: CONTAINER_LAYOUT,
    modes: GENESIS_DEPLOYMENT_MODES,
    operationalRules: [
      'Never let upscale compete with live preview at the same priority.',
      'Keep the preview model warm on the fastest GPU lane.',
      'Cancel stale preview and refine jobs aggressively.',
      'Promote preview/refine/upscale to separate workers as load increases.'
    ]
  };
}
