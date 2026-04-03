import { randomUUID } from 'node:crypto';

function createSvgDataUri({ title, subtitle, accent = '#7c3aed', bodyLines = [] }) {
  const safeLines = bodyLines
    .filter(Boolean)
    .map((line) => String(line).replace(/[<&>]/g, ''));

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
      </defs>
      <rect width="768" height="768" rx="48" fill="url(#bg)" />
      <rect x="32" y="32" width="704" height="704" rx="36" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="14 12" />
      <text x="56" y="110" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700">${title}</text>
      <text x="56" y="156" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="22">${subtitle}</text>
      ${safeLines
        .map(
          (line, index) =>
            `<text x="56" y="${240 + index * 38}" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, monospace" font-size="24">${line}</text>`
        )
        .join('')}
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class InMemoryAssetStore {
  constructor() {
    this.assets = new Map();
  }

  createUpload({ name = 'upload.png', uri, mimeType = 'image/png', kind = 'upload' }) {
    const asset = {
      assetId: `asset_${randomUUID()}`,
      name,
      kind,
      mimeType,
      uri,
      createdAt: new Date().toISOString()
    };
    this.assets.set(asset.assetId, asset);
    return asset;
  }

  createSyntheticAsset({ kind, title, subtitle, accent, bodyLines, metadata = {} }) {
    const asset = {
      assetId: `asset_${randomUUID()}`,
      name: `${kind}.svg`,
      kind,
      mimeType: 'image/svg+xml',
      uri: createSvgDataUri({ title, subtitle, accent, bodyLines }),
      metadata,
      createdAt: new Date().toISOString()
    };
    this.assets.set(asset.assetId, asset);
    return asset;
  }

  get(assetId) {
    return this.assets.get(assetId);
  }
}
