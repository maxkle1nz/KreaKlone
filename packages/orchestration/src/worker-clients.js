function buildServiceError(serviceName, response, payload) {
  const details = payload?.error || payload?.message || `request failed with status ${response.status}`;
  return new Error(`${serviceName} worker error: ${details}`);
}

async function postJson(url, body, { signal } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });

  const payload = await response.json();
  if (!response.ok) {
    throw buildServiceError(new URL(url).pathname, response, payload);
  }

  return payload;
}

export class WorkerClients {
  constructor({ previewWorkerUrl, refineWorkerUrl, upscaleWorkerUrl } = {}) {
    this.previewWorkerUrl = previewWorkerUrl;
    this.refineWorkerUrl = refineWorkerUrl;
    this.upscaleWorkerUrl = upscaleWorkerUrl;
  }

  hasRemotePreview() {
    return typeof this.previewWorkerUrl === 'string' && this.previewWorkerUrl.length > 0;
  }

  hasRemoteRefine() {
    return typeof this.refineWorkerUrl === 'string' && this.refineWorkerUrl.length > 0;
  }

  hasRemoteUpscale() {
    return typeof this.upscaleWorkerUrl === 'string' && this.upscaleWorkerUrl.length > 0;
  }

  requestPreview(job, { signal } = {}) {
    if (!this.hasRemotePreview()) {
      return null;
    }
    return postJson(new URL('/jobs/preview', this.previewWorkerUrl).toString(), { job }, { signal });
  }

  requestRefine(job, { signal } = {}) {
    if (!this.hasRemoteRefine()) {
      return null;
    }
    return postJson(new URL('/jobs/refine', this.refineWorkerUrl).toString(), { job }, { signal });
  }

  requestUpscale(job, { signal } = {}) {
    if (!this.hasRemoteUpscale()) {
      return null;
    }
    return postJson(new URL('/jobs/upscale', this.upscaleWorkerUrl).toString(), { job }, { signal });
  }
}
