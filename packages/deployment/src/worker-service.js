import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function defineWorkerManifest(manifest) {
  return Object.freeze({
    ...manifest,
    routes: Object.freeze(['/health', '/manifest'])
  });
}

function createSvgDataUri({ title, subtitle, accent = '#7c3aed', bodyLines = [] }) {
  const safeLines = bodyLines.filter(Boolean).map((line) => String(line).replace(/[<&>]/g, ''));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
      <rect width="768" height="768" rx="48" fill="#0f172a" />
      <rect x="32" y="32" width="704" height="704" rx="36" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="14 12" />
      <text x="56" y="110" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700">${title}</text>
      <text x="56" y="156" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="22">${subtitle}</text>
      ${safeLines.map((line, index) => `<text x="56" y="${240 + index * 38}" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="24">${line}</text>`).join('')}
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createPreviewPayload(job, manifest) {
  const variants = Array.from({ length: job.burstCount }, (_, ordinal) => ({
    variantId: `${job.jobId}_v${ordinal + 1}`,
    ordinal,
    seed: job.sessionVersion * 100 + ordinal + 1,
    mimeType: 'image/svg+xml',
    uri: createSvgDataUri({
      title: `${manifest.displayName} preview ${ordinal + 1}/${job.burstCount}`,
      subtitle: `${job.previewModel} • ${job.roi.width}×${job.roi.height}`,
      accent: '#38bdf8',
      bodyLines: [
        `session: ${job.sessionId}`,
        `queue: ${manifest.queue}`,
        `gpu target: ${manifest.gpuTargets[0] ?? 'unknown'}`
      ]
    })
  }));

  return {
    jobId: job.jobId,
    serviceId: manifest.serviceId,
    queue: manifest.queue,
    variants
  };
}

function createSingleAssetPayload(job, manifest, kind, accent) {
  return {
    jobId: job.jobId,
    serviceId: manifest.serviceId,
    queue: manifest.queue,
    assetId: `${kind}_${randomUUID()}`,
    mimeType: 'image/svg+xml',
    uri: createSvgDataUri({
      title: `${manifest.displayName} ${kind}`,
      subtitle: `${manifest.models[0] ?? kind} • ${job.roi?.width ?? job.targetLongEdge ?? 1024}`,
      accent,
      bodyLines: [
        `session: ${job.sessionId}`,
        `queue: ${manifest.queue}`,
        `gpu target: ${manifest.gpuTargets[0] ?? 'unknown'}`
      ]
    })
  };
}

export function createWorkerService(manifest, { port = 4100, host = '127.0.0.1' } = {}) {
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, {
        ok: true,
        serviceId: manifest.serviceId,
        queue: manifest.queue,
        keepWarm: manifest.keepWarm,
        models: manifest.models,
        gpuTargets: manifest.gpuTargets
      });
      return;
    }

    if (request.method === 'GET' && request.url === '/manifest') {
      json(response, 200, manifest);
      return;
    }

    if (request.method === 'POST' && request.url === '/jobs/preview') {
      const body = await readJsonBody(request);
      json(response, 202, createPreviewPayload(body.job, manifest));
      return;
    }

    if (request.method === 'POST' && request.url === '/jobs/refine') {
      const body = await readJsonBody(request);
      json(response, 202, createSingleAssetPayload(body.job, manifest, 'refine', '#22c55e'));
      return;
    }

    if (request.method === 'POST' && request.url === '/jobs/upscale') {
      const body = await readJsonBody(request);
      json(response, 202, createSingleAssetPayload(body.job, manifest, 'upscale', '#f59e0b'));
      return;
    }

    json(response, 404, { error: 'not found' });
  });

  return {
    manifest,
    host,
    port,
    server,
    async start() {
      await new Promise((resolve) => server.listen(port, host, resolve));
      return `http://${host}:${server.address().port}`;
    },
    async stop() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
