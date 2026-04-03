import { createServer } from 'node:http';

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createPngDataUri(label) {
  return `data:image/png;base64,${Buffer.from(label, 'utf8').toString('base64')}`;
}

export async function startRealPreviewAdapter() {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/preview') {
      json(response, 404, { error: 'not found' });
      return;
    }

    const payload = await readJsonBody(request);
    requests.push(payload);
    const job = payload.job ?? {};
    const burstCount = Number.isInteger(job.burstCount) ? job.burstCount : 1;

    json(response, 200, {
      images: Array.from({ length: burstCount }, (_, ordinal) => ({
        id: `${job.jobId}_real_${ordinal + 1}`,
        seed: job.sessionVersion * 1000 + ordinal + 1,
        mime_type: 'image/png',
        image_url: createPngDataUri(`${job.jobId}:${ordinal + 1}:${job.prompt?.positive ?? 'preview'}`)
      }))
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  };
}
