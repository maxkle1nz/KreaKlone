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

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSyntheticPreviewPayload(job, manifest) {
  return {
    jobId: job.jobId,
    serviceId: manifest.serviceId,
    queue: manifest.queue,
    provider: { mode: 'synthetic' },
    variants: Array.from({ length: job.burstCount }, (_, ordinal) => ({
      variantId: `${job.jobId}_v${ordinal + 1}`,
      ordinal,
      seed: job.sessionVersion * 100 + ordinal + 1,
      audioPositionMs: job.audioPositionMs ?? null,
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
    }))
  };
}

function normalizeVariant(source, job, ordinal) {
  const fallbackSeed = job.sessionVersion * 100 + ordinal + 1;
  const uri = source?.uri ?? source?.url ?? source?.imageUrl ?? source?.image_url;
  invariant(typeof uri === 'string' && uri.length > 0, `preview variant ${ordinal + 1} is missing a uri`);

  return {
    variantId: source?.variantId ?? source?.id ?? `${job.jobId}_v${ordinal + 1}`,
    ordinal: Number.isInteger(source?.ordinal) ? source.ordinal : ordinal,
    seed: Number.isFinite(source?.seed) ? source.seed : fallbackSeed,
    audioPositionMs: Number.isFinite(source?.audioPositionMs) ? source.audioPositionMs : (Number.isFinite(source?.audio_position_ms) ? source.audio_position_ms : (job.audioPositionMs ?? null)),
    mimeType: source?.mimeType ?? source?.mime_type ?? source?.contentType ?? 'image/png',
    uri
  };
}

function normalizeRealPreviewPayload(payload, job, manifest) {
  const sourceVariants = payload?.variants ?? payload?.images ?? payload?.outputs;
  invariant(Array.isArray(sourceVariants) && sourceVariants.length > 0, 'real preview adapter returned no preview variants');

  return {
    jobId: job.jobId,
    serviceId: manifest.serviceId,
    queue: manifest.queue,
    provider: {
      mode: 'real',
      providerId: payload?.providerId ?? 'remote-http-preview',
      model: payload?.model ?? job.previewModel
    },
    variants: sourceVariants.slice(0, job.burstCount).map((variant, ordinal) => normalizeVariant(variant, job, ordinal))
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createProviderError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createSyntheticPreviewProvider() {
  return {
    describe() {
      return { mode: 'synthetic' };
    },
    async generatePreview(job, manifest) {
      return buildSyntheticPreviewPayload(job, manifest);
    }
  };
}

export function createRealPreviewProvider({ endpointUrl, apiKey, fetchImpl = fetch } = {}) {
  invariant(typeof endpointUrl === 'string' && endpointUrl.length > 0, 'real preview provider requires PREVIEW_REAL_ADAPTER_URL');

  return {
    describe() {
      return { mode: 'real', endpointUrl };
    },
    async generatePreview(job, manifest) {
      const requestUrl = new URL('/preview', endpointUrl).toString();
      const response = await fetchImpl(requestUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ job, manifest })
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw createProviderError(payload?.error ?? `real preview adapter failed with status ${response.status}`);
      }
      return normalizeRealPreviewPayload(payload, job, manifest);
    }
  };
}

export function createPreviewProvider({ providerName = 'synthetic', endpointUrl, apiKey, fetchImpl } = {}) {
  const normalizedName = providerName.trim().toLowerCase();
  if (normalizedName === 'synthetic') {
    return createSyntheticPreviewProvider();
  }
  if (normalizedName === 'real') {
    return createRealPreviewProvider({ endpointUrl, apiKey, fetchImpl });
  }
  throw new Error(`unsupported preview provider: ${providerName}`);
}

export function createPreviewProviderFromEnv({ env = process.env, fetchImpl = fetch } = {}) {
  return createPreviewProvider({
    providerName: env.PREVIEW_PROVIDER ?? 'synthetic',
    endpointUrl: env.PREVIEW_REAL_ADAPTER_URL ?? env.PREVIEW_REAL_PROVIDER_URL,
    apiKey: env.PREVIEW_REAL_ADAPTER_TOKEN ?? env.PREVIEW_REAL_PROVIDER_API_KEY,
    fetchImpl
  });
}
