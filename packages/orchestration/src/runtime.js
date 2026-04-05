import { createBenchmarkCatalog } from '../../benchmark/src/scenarios.js';
import { createQueues } from '../../queues/src/lanes.js';
import { envelope, isQueueName, normalizeQueueSelection, parseJsonMessage, validateClientEnvelope, validateServerEnvelope } from '../../shared/src/contracts.js';
import { createPreviewJob, createRefineJob, createUpscaleJob } from '../../shared/src/jobs.js';
import { applyCanvasEvent, appendTimelineFrame, clearCaptureAsset, clearLoopRange, deleteTimelineFrame, pinTimelineFrame, recordCaptureAsset, recordGeneratedSeeds, recordRefinedAsset, recordUpscaledAsset, selectVariant, setFrameCapacity, setLoopRange } from '../../shared/src/session-state.js';
import { InMemoryAssetStore } from './asset-store.js';
import { InMemorySessionStore } from './session-store.js';
import { WorkerClients } from './worker-clients.js';

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new Error('aborted'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function makeQueueSnapshot(queue) {
  return queue.snapshot();
}

function fileExtensionForMimeType(mimeType = '') {
  if (mimeType === 'image/svg+xml') {
    return 'svg';
  }
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'bin';
}

function buildRemoteAssetName(baseName, mimeType) {
  return `${baseName}.${fileExtensionForMimeType(mimeType)}`;
}

function createPreviewVariantMap(remotePayload) {
  const variants = Array.isArray(remotePayload?.variants) ? remotePayload.variants : [];
  return new Map(
    variants
      .filter((variant) => variant && Number.isInteger(variant.ordinal))
      .map((variant) => [variant.ordinal, variant])
  );
}

function queueSelectionToList(selection) {
  return selection === 'all' ? ['preview', 'refine', 'upscale'] : [selection];
}

export class MvpRuntime {
  constructor({ previewStepMs = 60, refineStepMs = 180, upscaleStepMs = 140, workerClients = new WorkerClients() } = {}) {
    this.previewStepMs = previewStepMs;
    this.refineStepMs = refineStepMs;
    this.upscaleStepMs = upscaleStepMs;
    this.workerClients = workerClients;
    this.sessions = new InMemorySessionStore();
    this.assets = new InMemoryAssetStore();
    this.connectionsBySession = new Map();
    this.variantIndex = new Map();
    this.metrics = {
      cancelCount: 0,
      staleDrops: 0,
      workerFailures: 0
    };

    this.queues = createQueues({
      preview: (job, context) => this.#runPreviewJob(job, context),
      refine: (job, context) => this.#runRefineJob(job, context),
      upscale: (job, context) => this.#runUpscaleJob(job, context)
    }, {
      onError: (error, entry) => this.#handleQueueError(error, entry)
    });
  }

  createSession(sessionId) {
    const session = this.sessions.create(sessionId);
    return { session, queues: this.snapshotQueues() };
  }

  ensureSession(sessionId) {
    return this.sessions.ensure(sessionId);
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  uploadAsset(payload) {
    if (!payload?.uri || typeof payload.uri !== 'string') {
      throw new Error('asset upload requires a uri string');
    }

    return this.assets.createUpload(payload);
  }

  getAsset(assetId) {
    return this.assets.get(assetId);
  }

  getRuntimeMetrics() {
    return {
      cancel_success_rate: this.metrics.cancelCount,
      stale_result_drop_rate: this.metrics.staleDrops,
      worker_failure_count: this.metrics.workerFailures,
      session_active_count: this.sessions.list().length
    };
  }

  getBenchmarks() {
    return {
      ...createBenchmarkCatalog(),
      runtimeMetrics: this.getRuntimeMetrics()
    };
  }

  handleConnection(connection) {
    let joinedSessionId;

    connection.onMessage((rawMessage) => {
      try {
        const message = validateClientEnvelope(parseJsonMessage(rawMessage, 'websocket payload'));

        switch (message.type) {
          case 'session.join':
            joinedSessionId = message.payload.sessionId;
            this.joinSession(joinedSessionId, connection);
            break;
          case 'canvas.event':
            this.applyCanvasEvent(message.payload.sessionId, message.payload.event);
            break;
          case 'preview.request':
            this.requestPreview(message.payload.sessionId, {
              burstCount: message.payload.burstCount,
              audioPositionMs: message.payload.audioPositionMs ?? null
            });
            break;
          case 'preview.cancel':
            this.cancelQueues(message.payload.sessionId, normalizeQueueSelection(message.payload.queue), 'client requested cancellation');
            break;
          case 'timeline.seek': {
            const nextSession = selectVariant(this.ensureSession(message.payload.sessionId), message.payload.frameId);
            this.sessions.save(nextSession);
            this.#sendSessionState(nextSession.sessionId);
            break;
          }
          case 'timeline.pin': {
            const nextSession = pinTimelineFrame(this.ensureSession(message.payload.sessionId), message.payload.frameId);
            this.sessions.save(nextSession);
            this.#sendSessionState(nextSession.sessionId);
            break;
          }
          case 'timeline.delete': {
            const nextSession = deleteTimelineFrame(this.ensureSession(message.payload.sessionId), message.payload.frameId);
            this.sessions.save(nextSession);
            this.#sendSessionState(nextSession.sessionId);
            break;
          }
          case 'timeline.capacity.set': {
            const nextSession = setFrameCapacity(this.ensureSession(message.payload.sessionId), message.payload.frameCapacity);
            this.sessions.save(nextSession);
            this.#sendSessionState(nextSession.sessionId);
            break;
          }
          case 'timeline.loop.set': {
            const nextSession = setLoopRange(this.ensureSession(message.payload.sessionId), {
              startFrameId: message.payload.startFrameId,
              endFrameId: message.payload.endFrameId
            });
            this.sessions.save(nextSession);
            this.#sendSessionState(nextSession.sessionId);
            break;
          }
          case 'timeline.loop.clear': {
            const nextSession = clearLoopRange(this.ensureSession(message.payload.sessionId));
            this.sessions.save(nextSession);
            this.#sendSessionState(nextSession.sessionId);
            break;
          }
          case 'record.start':
            this.requestRecord(message.payload.sessionId, message.payload.source);
            break;
          case 'record.stop':
            this.stopRecord(message.payload.sessionId);
            break;
          default:
            break;
        }
      } catch (error) {
        if (joinedSessionId) {
          this.#broadcast(joinedSessionId, envelope('job.failed', {
            jobId: 'transport',
            sessionId: joinedSessionId,
            error: error.message
          }));
        }
      }
    });

    connection.onClose(() => {
      if (!joinedSessionId) {
        return;
      }
      const activeConnections = this.connectionsBySession.get(joinedSessionId);
      if (!activeConnections) {
        return;
      }
      activeConnections.delete(connection);
      if (activeConnections.size === 0) {
        this.connectionsBySession.delete(joinedSessionId);
      }
    });
  }

  joinSession(sessionId, connection) {
    const session = this.ensureSession(sessionId);
    const set = this.connectionsBySession.get(sessionId) ?? new Set();
    set.add(connection);
    this.connectionsBySession.set(sessionId, set);
    this.#sendSessionState(session.sessionId, connection);
    return session;
  }

  applyCanvasEvent(sessionId, canvasEvent) {
    const session = this.ensureSession(sessionId);
    const nextSession = applyCanvasEvent(session, canvasEvent);
    this.sessions.save(nextSession);
    this.cancelStaleWork(nextSession.sessionId, nextSession.version, 'new canvas edit superseded older work');
    this.#sendSessionState(nextSession.sessionId);
    return nextSession;
  }

  requestPreview(sessionId, options = {}) {
    const session = this.ensureSession(sessionId);
    this.#cancelWithPredicate(['preview'], (entry) => entry.job.sessionId === sessionId && entry.job.sessionVersion <= session.version, 'replaced preview request');
    const job = createPreviewJob(session, options);
    const queueEntryId = this.queues.previewQueue.enqueue(job, { sessionId, kind: 'preview' });
    this.#sendSessionState(sessionId);
    return { queueEntryId, job };
  }

  requestRefine(sessionId, sourceVariantId) {
    const session = this.ensureSession(sessionId);
    if (!this.variantIndex.has(sourceVariantId)) {
      throw new Error(`unknown preview variant: ${sourceVariantId}`);
    }
    const nextSession = selectVariant(session, sourceVariantId);
    this.sessions.save(nextSession);
    this.cancelStaleWork(sessionId, nextSession.version, 'new selection superseded older refine/upscale work');
    const job = createRefineJob(nextSession, sourceVariantId);
    const queueEntryId = this.queues.refineQueue.enqueue(job, { sessionId, kind: 'refine' });
    this.#sendSessionState(sessionId);
    return { queueEntryId, job, session: nextSession };
  }

  requestUpscale(sessionId, sourceImageId) {
    const session = this.ensureSession(sessionId);
    if (!this.assets.get(sourceImageId)) {
      throw new Error(`unknown asset: ${sourceImageId}`);
    }
    this.#cancelWithPredicate(['upscale'], (entry) => entry.job.sessionId === sessionId, 'replaced upscale request');
    const job = createUpscaleJob(session, sourceImageId);
    const queueEntryId = this.queues.upscaleQueue.enqueue(job, { sessionId, kind: 'upscale' });
    this.#sendSessionState(sessionId);
    return { queueEntryId, job };
  }

  pinFrame(sessionId, frameId) {
    const session = this.ensureSession(sessionId);
    const nextSession = pinTimelineFrame(session, frameId);
    this.sessions.save(nextSession);
    this.#sendSessionState(sessionId);
    return nextSession;
  }

  deleteFrame(sessionId, frameId) {
    const session = this.ensureSession(sessionId);
    const nextSession = deleteTimelineFrame(session, frameId);
    this.sessions.save(nextSession);
    this.#sendSessionState(sessionId);
    return nextSession;
  }

  updateSessionSettings(sessionId, settings = {}) {
    const session = this.ensureSession(sessionId);
    let nextSession = session;
    if (settings.frameCapacity !== undefined) {
      nextSession = setFrameCapacity(nextSession, settings.frameCapacity);
    }
    this.sessions.save(nextSession);
    this.#sendSessionState(sessionId);
    return nextSession;
  }

  cancelQueues(sessionId, selection = 'all', reason = 'canceled') {
    return this.#cancelWithPredicate(queueSelectionToList(selection), (entry) => entry.job.sessionId === sessionId, reason);
  }

  cancelStaleWork(sessionId, version, reason) {
    return this.#cancelWithPredicate(['preview', 'refine', 'upscale'], (entry) => entry.job.sessionId === sessionId && entry.job.sessionVersion < version, reason);
  }

  snapshotQueues() {
    return {
      preview: makeQueueSnapshot(this.queues.previewQueue),
      refine: makeQueueSnapshot(this.queues.refineQueue),
      upscale: makeQueueSnapshot(this.queues.upscaleQueue)
    };
  }

  async #runPreviewJob(job, { signal }) {
    if (!this.#isCurrentSessionVersion(job.sessionId, job.sessionVersion)) {
      this.metrics.staleDrops += 1;
      return;
    }

    this.#broadcast(job.sessionId, envelope('preview.started', {
      jobId: job.jobId,
      sessionId: job.sessionId,
      sessionVersion: job.sessionVersion,
      burstCount: job.burstCount,
      roi: job.roi
    }));

    const remotePayload = await this.workerClients.requestPreview(job, { signal });
    const remoteVariants = createPreviewVariantMap(remotePayload);
    const seeds = [];
    for (let ordinal = 0; ordinal < job.burstCount; ordinal += 1) {
      const remoteVariant = remoteVariants.get(ordinal);
      const perVariantStepMs = remoteVariant ? Math.min(this.previewStepMs, 10) : this.previewStepMs;
      await delay(perVariantStepMs, signal);
      if (!this.#isCurrentSessionVersion(job.sessionId, job.sessionVersion)) {
        this.metrics.staleDrops += 1;
        return;
      }

      const seed = remoteVariant?.seed ?? job.sessionVersion * 100 + ordinal + 1;
      const variantId = remoteVariant?.variantId ?? `${job.jobId}_v${ordinal + 1}`;
      const asset = remoteVariant
        ? this.assets.createUpload({
            name: buildRemoteAssetName(variantId, remoteVariant.mimeType),
            kind: 'preview',
            mimeType: remoteVariant.mimeType ?? 'image/svg+xml',
            uri: remoteVariant.uri,
            metadata: {
              jobId: job.jobId,
              sessionId: job.sessionId,
              sessionVersion: job.sessionVersion,
              variantId,
              ordinal,
              seed,
              serviceId: remotePayload?.serviceId ?? null,
              queue: remotePayload?.queue ?? job.queue,
              provider: remotePayload?.provider ?? null,
              workerVariant: remoteVariant?.metadata ?? null
            }
          })
        : this.assets.createSyntheticAsset({
            kind: 'preview',
            title: `Preview ${ordinal + 1}/${job.burstCount}`,
            subtitle: `${job.previewModel} • ${job.roi.width}×${job.roi.height}`,
            accent: '#38bdf8',
            bodyLines: [
              `session: ${job.sessionId}`,
              `version: ${job.sessionVersion}`,
              `seed: ${seed}`,
              `prompt: ${(job.prompt.positive || 'Describe your edit').slice(0, 56)}`
            ],
            metadata: { jobId: job.jobId, sessionId: job.sessionId, variantId }
          });

      this.variantIndex.set(variantId, {
        sessionId: job.sessionId,
        sessionVersion: job.sessionVersion,
        assetId: asset.assetId,
        uri: asset.uri
      });
      seeds.push(seed);
      const currentSession = this.sessions.get(job.sessionId);
      if (currentSession && currentSession.version === job.sessionVersion) {
        this.sessions.save(appendTimelineFrame(currentSession, {
          frameId: variantId,
          createdAt: new Date().toISOString(),
          assetId: asset.assetId,
          ordinal,
          seed,
          audioPositionMs: job.audioPositionMs ?? null
        }));
      }

      this.#broadcast(job.sessionId, envelope('preview.partial', {
        jobId: job.jobId,
        sessionId: job.sessionId,
        sessionVersion: job.sessionVersion,
        variantId,
        ordinal,
        seed,
        assetId: asset.assetId,
        uri: asset.uri,
        roi: job.roi
      }));
      this.#broadcast(job.sessionId, envelope('timeline.frame', {
        jobId: job.jobId,
        sessionId: job.sessionId,
        sessionVersion: job.sessionVersion,
        frameId: variantId,
        variantId,
        ordinal,
        assetId: asset.assetId,
        uri: asset.uri,
        audioPositionMs: job.audioPositionMs ?? null
      }));
    }

    const session = this.sessions.get(job.sessionId);
    if (!session || session.version !== job.sessionVersion) {
      this.metrics.staleDrops += 1;
      return;
    }

    this.sessions.save(recordGeneratedSeeds(session, seeds));
    this.#broadcast(job.sessionId, envelope('preview.completed', {
      jobId: job.jobId,
      sessionId: job.sessionId,
      sessionVersion: job.sessionVersion,
      totalVariants: job.burstCount
    }));
    this.#broadcast(job.sessionId, envelope('timeline.snapshot', {
      sessionId: job.sessionId,
      frames: session.timelineFrames
    }));
    this.#sendSessionState(job.sessionId);
  }

  async #runRefineJob(job, { signal }) {
    const remotePayload = await this.workerClients.requestRefine(job, { signal });
    if (!remotePayload) {
      await delay(this.refineStepMs, signal);
    }
    const session = this.sessions.get(job.sessionId);
    if (!session || session.version !== job.sessionVersion || session.activeFrameId !== job.sourceVariantId) {
      this.metrics.staleDrops += 1;
      return;
    }

    const sourceVariant = this.variantIndex.get(job.sourceVariantId);
    const asset = remotePayload
      ? this.assets.createUpload({
          name: buildRemoteAssetName(job.jobId, remotePayload.mimeType),
          kind: 'refine',
          mimeType: remotePayload.mimeType ?? 'image/svg+xml',
          uri: remotePayload.uri,
          metadata: {
            jobId: job.jobId,
            sessionId: job.sessionId,
            sessionVersion: job.sessionVersion,
            sourceVariantId: job.sourceVariantId,
            serviceId: remotePayload.serviceId ?? null,
            queue: remotePayload.queue ?? job.queue
          }
        })
      : this.assets.createSyntheticAsset({
          kind: 'refine',
          title: 'Refined selection',
          subtitle: `${job.refineModel} • ROI ${job.roi.width}×${job.roi.height}`,
          accent: '#22c55e',
          bodyLines: [
            `session: ${job.sessionId}`,
            `variant: ${job.sourceVariantId}`,
            `based on: ${sourceVariant?.assetId ?? 'preview asset'}`
          ],
          metadata: { jobId: job.jobId, sessionId: job.sessionId, sourceVariantId: job.sourceVariantId }
        });

    this.sessions.save(recordRefinedAsset(session, asset.assetId));
    this.#broadcast(job.sessionId, envelope('refine.completed', {
      jobId: job.jobId,
      sessionId: job.sessionId,
      sessionVersion: job.sessionVersion,
      assetId: asset.assetId,
      uri: asset.uri,
      sourceVariantId: job.sourceVariantId
    }));
    this.#sendSessionState(job.sessionId);
  }

  async #runUpscaleJob(job, { signal }) {
    const remotePayload = await this.workerClients.requestUpscale(job, { signal });
    if (!remotePayload) {
      await delay(this.upscaleStepMs, signal);
    }
    const session = this.sessions.get(job.sessionId);
    if (!session || session.version !== job.sessionVersion || session.activeFrameId !== job.selectedVariantId) {
      this.metrics.staleDrops += 1;
      return;
    }

    const asset = remotePayload
      ? this.assets.createUpload({
          name: buildRemoteAssetName(job.jobId, remotePayload.mimeType),
          kind: 'upscale',
          mimeType: remotePayload.mimeType ?? 'image/svg+xml',
          uri: remotePayload.uri,
          metadata: {
            jobId: job.jobId,
            sessionId: job.sessionId,
            sessionVersion: job.sessionVersion,
            sourceImageId: job.sourceImageId,
            selectedVariantId: job.selectedVariantId,
            serviceId: remotePayload.serviceId ?? null,
            queue: remotePayload.queue ?? job.queue
          }
        })
      : this.assets.createSyntheticAsset({
          kind: 'upscale',
          title: 'Upscaled asset',
          subtitle: `${job.mode} • long edge ${job.targetLongEdge}`,
          accent: '#f59e0b',
          bodyLines: [
            `session: ${job.sessionId}`,
            `source image: ${job.sourceImageId}`,
            `selected variant: ${job.selectedVariantId ?? 'none'}`
          ],
          metadata: { jobId: job.jobId, sessionId: job.sessionId, sourceImageId: job.sourceImageId }
        });

    this.sessions.save(recordUpscaledAsset(session, asset.assetId));
    this.#broadcast(job.sessionId, envelope('upscale.completed', {
      jobId: job.jobId,
      sessionId: job.sessionId,
      sessionVersion: job.sessionVersion,
      assetId: asset.assetId,
      uri: asset.uri,
      sourceVariantId: job.selectedVariantId
    }));
    this.#sendSessionState(job.sessionId);
  }

  #cancelWithPredicate(queueNames, predicate, reason) {
    const canceled = [];

    for (const queueName of queueNames) {
      const queue = this.#queueForName(queueName);
      canceled.push(...queue.cancel(predicate, reason));
    }

    if (canceled.length > 0) {
      this.metrics.cancelCount += canceled.length;
      const touchedSessions = new Set();

      for (const entry of canceled) {
        touchedSessions.add(entry.job.sessionId);
        this.#broadcast(entry.job.sessionId, envelope('job.canceled', {
          jobId: entry.job.jobId,
          sessionId: entry.job.sessionId,
          reason
        }));
      }

      for (const sessionId of touchedSessions) {
        this.#sendSessionState(sessionId);
      }
    }

    return canceled;
  }

  #handleQueueError(error, entry) {
    this.metrics.workerFailures += 1;
    const message = error instanceof Error ? error.message : String(error ?? 'unknown worker failure');
    this.#broadcast(entry.job.sessionId, envelope('job.failed', {
      jobId: entry.job.jobId,
      sessionId: entry.job.sessionId,
      queue: entry.job.queue,
      error: message
    }));
    this.#sendSessionState(entry.job.sessionId);
  }

  requestRecord(sessionId, source = 'output') {
    const session = this.ensureSession(sessionId);
    const activeFrameId = session.activeFrameId ?? session.selectedVariantId;
    const activeAssetId = activeFrameId ? this.variantIndex.get(activeFrameId)?.assetId : undefined;
    if (!activeAssetId) {
      throw new Error('no active frame selected for recording');
    }

    const asset = this.assets.createSyntheticAsset({
      kind: 'recording',
      title: source === 'full-session' ? 'Full session recording' : 'Output recording',
      subtitle: `recorded from ${activeFrameId}`,
      accent: '#f97316',
      bodyLines: [
        `session: ${sessionId}`,
        `frame: ${activeFrameId}`,
        `source: ${source}`
      ],
      metadata: { sessionId, frameId: activeFrameId, source }
    });

    this.sessions.save(recordCaptureAsset(session, asset.assetId));
    this.#broadcast(sessionId, envelope('record.completed', {
      jobId: `record_${sessionId}`,
      sessionId,
      sessionVersion: session.version,
      assetId: asset.assetId,
      uri: asset.uri,
      sourceVariantId: activeFrameId
    }));
    this.#sendSessionState(sessionId);
    return { assetId: asset.assetId };
  }

  stopRecord(sessionId) {
    const session = this.ensureSession(sessionId);
    if (!session.latestRecordingAssetId) {
      return { cleared: false };
    }

    this.sessions.save(clearCaptureAsset(session));
    this.#sendSessionState(sessionId);
    return { cleared: true };
  }

  #queueForName(queueName) {
    if (!isQueueName(queueName)) {
      throw new Error(`unknown queue: ${queueName}`);
    }

    if (queueName === 'preview') {
      return this.queues.previewQueue;
    }
    if (queueName === 'refine') {
      return this.queues.refineQueue;
    }
    return this.queues.upscaleQueue;
  }

  #isCurrentSessionVersion(sessionId, version) {
    const session = this.sessions.get(sessionId);
    return Boolean(session && session.version === version);
  }

  #sendSessionState(sessionId, targetConnection) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const message = envelope('session.state', {
      sessionId: session.sessionId,
      version: session.version,
      session,
      queues: this.snapshotQueues()
    });

    if (targetConnection) {
      validateServerEnvelope(message);
      targetConnection.send(JSON.stringify(message));
      return;
    }

    this.#broadcast(sessionId, message);
  }

  #broadcast(sessionId, message) {
    validateServerEnvelope(message);
    const listeners = this.connectionsBySession.get(sessionId);
    if (!listeners || listeners.size === 0) {
      return;
    }

    const serialized = JSON.stringify(message);
    for (const connection of listeners) {
      connection.send(serialized);
    }
  }
}

export function createMvpRuntime(options) {
  return new MvpRuntime(options);
}
