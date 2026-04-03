export class CancelableJobQueue {
  constructor({ name, worker, concurrency = 1, onError } = {}) {
    this.name = name;
    this.worker = worker;
    this.concurrency = concurrency;
    this.onError = onError;
    this.pending = [];
    this.active = new Map();
    this.sequence = 0;
    this.idleResolvers = [];
  }

  enqueue(job, meta = {}) {
    const abortController = new AbortController();
    const entry = {
      id: `${this.name}-${++this.sequence}`,
      job,
      meta,
      abortController,
      state: "queued",
      sequence: this.sequence
    };

    this.pending.push(entry);
    this.pending.sort((left, right) => (right.job.priority ?? 0) - (left.job.priority ?? 0) || left.sequence - right.sequence);
    queueMicrotask(() => this.#drain());
    return entry.id;
  }

  cancel(predicate, reason = "canceled") {
    const canceled = [];

    for (const entry of this.pending) {
      if (predicate(entry)) {
        entry.state = "canceled";
        entry.abortController.abort(reason);
        canceled.push(entry);
      }
    }

    this.pending = this.pending.filter((entry) => !canceled.includes(entry));

    for (const entry of this.active.values()) {
      if (predicate(entry) && !entry.abortController.signal.aborted) {
        entry.abortController.abort(reason);
        canceled.push(entry);
      }
    }

    this.#resolveIdleIfNeeded();
    return canceled;
  }

  snapshot() {
    return {
      queued: this.pending.map((entry) => ({ id: entry.id, meta: entry.meta, jobId: entry.job.jobId })),
      active: [...this.active.values()].map((entry) => ({ id: entry.id, meta: entry.meta, jobId: entry.job.jobId }))
    };
  }

  async waitForIdle() {
    if (this.pending.length === 0 && this.active.size === 0) {
      return;
    }
    await new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  async #drain() {
    while (this.active.size < this.concurrency && this.pending.length > 0) {
      const entry = this.pending.shift();
      if (!entry || entry.abortController.signal.aborted) {
        continue;
      }
      entry.state = "active";
      this.active.set(entry.id, entry);
      this.worker(entry.job, {
        id: entry.id,
        meta: entry.meta,
        signal: entry.abortController.signal
      })
        .catch((error) => {
          this.onError?.(error, entry);
        })
        .finally(() => {
          this.active.delete(entry.id);
          this.#resolveIdleIfNeeded();
          queueMicrotask(() => this.#drain());
        });
    }
  }

  #resolveIdleIfNeeded() {
    if (this.pending.length === 0 && this.active.size === 0) {
      for (const resolve of this.idleResolvers.splice(0)) {
        resolve();
      }
    }
  }
}
