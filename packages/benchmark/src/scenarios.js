import { createDeploymentScaffoldManifest } from '../../deployment/src/scaffold.js';

export const BENCHMARK_METRICS = Object.freeze([
  'preview_first_ms',
  'preview_burst_complete_ms',
  'refine_ms',
  'cancel_success_rate',
  'stale_result_drop_rate',
  'gpu_memory_used_gb',
  'gpu_utilization_pct',
  'session_active_count'
]);

export const BENCHMARK_CAPTURE_FIELDS = Object.freeze([
  'time_to_first_preview_ms',
  'time_to_full_burst_ms',
  'time_to_refine_ms',
  'time_to_upscale_ms',
  'working_resolution',
  'burst_count',
  'step_count',
  'vram_peak_gb',
  'gpu_utilization_pct',
  'cancelation_correct',
  'stale_result_dropped'
]);

export const BENCHMARK_SCENARIOS = Object.freeze([
  {
    id: 'B1',
    name: 'Prompt burst',
    lane: 'preview',
    model: 'SDXL-Turbo',
    burstCount: 4,
    workingResolution: 1024,
    roiMode: 'full-frame',
    expectedOutcome: 'First preview under 1s with 4 visible burst candidates',
    queue: { name: 'preview', priority: 'highest' },
    targets: { previewFirstMs: 900, previewBurstCompleteMs: 1200 }
  },
  {
    id: 'B2',
    name: 'Ref-guided burst',
    lane: 'preview',
    model: 'SDXL-Turbo',
    burstCount: 4,
    workingResolution: 1024,
    roiMode: 'reference-conditioned',
    expectedOutcome: 'Reference conditioning is visible across burst variants',
    queue: { name: 'preview', priority: 'highest' },
    targets: { previewFirstMs: 900, previewBurstCompleteMs: 1200 }
  },
  {
    id: 'B3',
    name: 'ROI mask edit',
    lane: 'preview',
    model: 'SDXL-Turbo',
    burstCount: 4,
    workingResolution: 768,
    roiMode: '512-roi',
    expectedOutcome: 'Only the edited mask region is regenerated',
    queue: { name: 'preview', priority: 'highest' },
    targets: { previewFirstMs: 900, previewBurstCompleteMs: 1200 }
  },
  {
    id: 'B4',
    name: 'Region prompt edit',
    lane: 'preview',
    model: 'SDXL-Turbo',
    burstCount: 4,
    workingResolution: 768,
    roiMode: 'selected-region',
    expectedOutcome: 'Prompt deltas stay local to the selected region',
    queue: { name: 'preview', priority: 'highest' },
    targets: { previewFirstMs: 900, previewBurstCompleteMs: 1200 }
  },
  {
    id: 'B5',
    name: 'Idle refine',
    lane: 'refine',
    model: 'Qwen-Image-Edit',
    burstCount: 1,
    workingResolution: 768,
    roiMode: 'selected-variant',
    expectedOutcome: 'Selected preview refines within target latency',
    queue: { name: 'refine', priority: 'medium' },
    targets: { refineMs: 5000 }
  },
  {
    id: 'B6',
    name: 'Async upscale',
    lane: 'upscale',
    model: 'project-selected-upscale',
    burstCount: 1,
    workingResolution: 1024,
    roiMode: 'full-frame',
    expectedOutcome: 'Upscale completes without blocking preview',
    queue: { name: 'upscale', priority: 'low' },
    targets: { upscaleAsync: true }
  }
]);

export const GENESIS_BENCHMARK_RUNBOOK = Object.freeze([
  Object.freeze({ id: 'G1', scenarioId: 'B1', description: 'Warm SDXL-Turbo full-frame 1024 preview burst on the primary preview lane.' }),
  Object.freeze({ id: 'G2', scenarioId: 'B3', description: 'Measure 512-768 ROI preview speed after region/mask edits.' }),
  Object.freeze({ id: 'G3', scenarioId: 'B1', burstCountOverride: 8, description: 'Stress the preview lane with an 8-candidate burst.' }),
  Object.freeze({ id: 'G4', scenarioId: 'B5', workingResolutionOverride: 768, description: 'Benchmark Qwen-Image-Edit on ROI-based refine.' }),
  Object.freeze({ id: 'G5', scenarioId: 'B5', workingResolutionOverride: 1024, roiModeOverride: 'full-frame', description: 'Benchmark full-frame refine latency for fallback planning.' }),
  Object.freeze({ id: 'G6', scenarioId: 'B6', description: 'Confirm the detached upscale lane does not interfere with preview throughput.' })
]);

export const DEPLOYMENT_TOPOLOGY = Object.freeze({
  primaryGpu: 'RTX 4090',
  fallbackGpu: 'L4',
  roles: Object.freeze({
    app: 'CPU VM',
    preview: 'GPU host / warm preview lane',
    refine: 'GPU host / lower-priority lane',
    upscale: 'Optional detached worker'
  })
});

export function createBenchmarkCatalog() {
  return {
    generatedAt: new Date().toISOString(),
    metrics: BENCHMARK_METRICS,
    captureFields: BENCHMARK_CAPTURE_FIELDS,
    deployment: DEPLOYMENT_TOPOLOGY,
    deploymentScaffold: createDeploymentScaffoldManifest(),
    runbook: GENESIS_BENCHMARK_RUNBOOK,
    scenarios: BENCHMARK_SCENARIOS
  };
}
