import { CancelableJobQueue } from './priority-job-queue.js';

export const QUEUE_POLICY = Object.freeze({
  preview: { priority: 'highest', concurrency: 1 },
  refine: { priority: 'medium', concurrency: 1 },
  upscale: { priority: 'low', concurrency: 1 }
});

export function createQueues(handlers, options = {}) {
  const onError = options.onError;
  return {
    previewQueue: new CancelableJobQueue({
      name: 'preview',
      worker: handlers.preview,
      concurrency: QUEUE_POLICY.preview.concurrency,
      onError
    }),
    refineQueue: new CancelableJobQueue({
      name: 'refine',
      worker: handlers.refine,
      concurrency: QUEUE_POLICY.refine.concurrency,
      onError
    }),
    upscaleQueue: new CancelableJobQueue({
      name: 'upscale',
      worker: handlers.upscale,
      concurrency: QUEUE_POLICY.upscale.concurrency,
      onError
    })
  };
}
