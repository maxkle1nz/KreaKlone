import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMvpRuntime } from '../../../packages/orchestration/src/index.js';
import { attachWebSocketServer } from '../../../packages/orchestration/src/websocket-server.js';
import { WorkerClients } from '../../../packages/orchestration/src/worker-clients.js';

const WEB_ROOT = fileURLToPath(new URL('../../web', import.meta.url));
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    const size = chunks.reduce((total, value) => total + value.length, 0);
    if (size > 2_000_000) {
      throw new Error('request body exceeded 2 MB scaffold limit');
    }
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(request, response) {
  const requestPath = request.url === '/' ? '/index.html' : request.url;
  const safePath = requestPath.replace(/\.\.+/g, '');
  const filePath = join(WEB_ROOT, safePath);
  const content = await readFile(filePath);
  response.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] ?? 'text/plain; charset=utf-8' });
  response.end(content);
}

export function createAppServer(options = {}) {
  const port = options.port ?? Number.parseInt(process.env.PORT ?? '3000', 10);
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  let runtime = options.runtime;

  function getRuntime() {
    if (!runtime) {
      runtime = createMvpRuntime({
        workerClients: new WorkerClients({
          previewWorkerUrl: process.env.PREVIEW_WORKER_URL,
          refineWorkerUrl: process.env.REFINE_WORKER_URL,
          upscaleWorkerUrl: process.env.UPSCALE_WORKER_URL
        })
      });
    }

    return runtime;
  }

  const server = createHttpServer(async (request, response) => {
    try {
      if (!request.url) {
        json(response, 400, { error: 'missing url' });
        return;
      }

      if (request.method === 'GET' && request.url === '/health') {
        json(response, 200, {
          ok: true,
          websocketConnections: websocketGateway.connectionCount(),
          activeSessions: getRuntime().getRuntimeMetrics().session_active_count
        });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/sessions') {
        const body = await readJsonBody(request);
        const { session, queues } = getRuntime().createSession(body.sessionId);
        json(response, 201, { session, queues });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/assets/upload') {
        const asset = getRuntime().uploadAsset(await readJsonBody(request));
        json(response, 201, asset);
        return;
      }

      if (request.method === 'POST' && request.url === '/api/refine') {
        const body = await readJsonBody(request);
        const result = getRuntime().requestRefine(body.sessionId, body.variantId);
        json(response, 202, result);
        return;
      }

      if (request.method === 'POST' && request.url === '/api/timeline/delete-frame') {
        const body = await readJsonBody(request);
        const session = getRuntime().deleteFrame(body.sessionId, body.frameId);
        json(response, 200, { session });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/timeline/pin-frame') {
        const body = await readJsonBody(request);
        const session = getRuntime().pinFrame(body.sessionId, body.frameId);
        json(response, 200, { session });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/sessions/settings') {
        const body = await readJsonBody(request);
        const session = getRuntime().updateSessionSettings(body.sessionId, { frameCapacity: body.frameCapacity });
        json(response, 200, { session });
        return;
      }

      if (request.method === 'POST' && request.url === '/api/upscale') {
        const body = await readJsonBody(request);
        const result = getRuntime().requestUpscale(body.sessionId, body.assetId);
        json(response, 202, result);
        return;
      }

      if (request.method === 'POST' && request.url === '/api/record/start') {
        const body = await readJsonBody(request);
        const result = getRuntime().requestRecord(body.sessionId, body.source ?? 'output');
        json(response, 202, result);
        return;
      }

      if (request.method === 'GET' && request.url === '/api/benchmarks') {
        json(response, 200, getRuntime().getBenchmarks());
        return;
      }

      if (request.method === 'GET' && request.url.startsWith('/api/assets/')) {
        const assetId = request.url.split('/').pop();
        const asset = getRuntime().getAsset(assetId);
        if (!asset) {
          json(response, 404, { error: 'asset not found' });
          return;
        }
        json(response, 200, asset);
        return;
      }

      if (request.method === 'POST' && request.url === '/api/preview') {
        const body = await readJsonBody(request);
        const result = getRuntime().requestPreview(body.sessionId, { burstCount: body.burstCount });
        json(response, 202, result);
        return;
      }

      if (request.method === 'GET') {
        await serveStatic(request, response);
        return;
      }

      json(response, 404, { error: 'not found' });
    } catch (error) {
      json(response, 500, { error: error.message });
    }
  });

  const websocketGateway = attachWebSocketServer(server, {
    path: '/ws',
    onConnection(connection) {
      getRuntime().handleConnection(connection);
    }
  });

  return {
    host,
    port,
    get runtime() {
      return getRuntime();
    },
    server,
    websocketGateway,
    async start() {
      await new Promise((resolve) => server.listen(port, host, resolve));
      return `http://${host}:${server.address().port}`;
    },
    async stop() {
      websocketGateway.closeAll('server shutdown');
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createAppServer();
  app.start().then((url) => {
    process.stdout.write(`KreaKlone scaffold listening on ${url}\n`);
  });
}
