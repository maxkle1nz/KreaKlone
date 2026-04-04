const state = {
  sessionId: undefined,
  sessionVersion: 0,
  websocket: undefined,
  connected: false,
  roi: undefined,
  dragStart: undefined,
  promptTimer: undefined,
  frames: [],
  selectedVariantId: undefined,
  activeFrameId: undefined,
  selectedAssetId: undefined,
  latestUpscaleAssetId: undefined,
  latestRecordingAssetId: undefined,
  playbackTimer: undefined,
  playbackIndex: 0,
  loopEnabled: false
};

const elements = {
  canvas: document.getElementById('stage'),
  connectButton: document.getElementById('connectButton'),
  generateButton: document.getElementById('generateButton'),
  cancelButton: document.getElementById('cancelButton'),
  upscaleButton: document.getElementById('upscaleButton'),
  playButton: document.getElementById('playButton'),
  pauseButton: document.getElementById('pauseButton'),
  loopButton: document.getElementById('loopButton'),
  recordButton: document.getElementById('recordButton'),
  promptInput: document.getElementById('promptInput'),
  negativePromptInput: document.getElementById('negativePromptInput'),
  burstInput: document.getElementById('burstInput'),
  burstLabel: document.getElementById('burstLabel'),
  fileInput: document.getElementById('fileInput'),
  sessionIdLabel: document.getElementById('sessionIdLabel'),
  sessionVersionLabel: document.getElementById('sessionVersionLabel'),
  roiLabel: document.getElementById('roiLabel'),
  variants: document.getElementById('variants'),
  eventLog: document.getElementById('eventLog')
};

const context = elements.canvas.getContext('2d');

function log(message) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  elements.eventLog.prepend(item);
}

function drawStage() {
  context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, elements.canvas.width, elements.canvas.height);

  const gradient = context.createLinearGradient(0, 0, elements.canvas.width, elements.canvas.height);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(1, '#1d4ed8');
  context.fillStyle = gradient;
  context.fillRect(48, 48, elements.canvas.width - 96, elements.canvas.height - 96);

  context.fillStyle = 'rgba(255,255,255,0.08)';
  for (let index = 0; index < 12; index += 1) {
    context.fillRect(96 + index * 64, 220 + (index % 3) * 72, 28, 220);
  }

  context.fillStyle = '#e2e8f0';
  context.font = '600 32px Inter, sans-serif';
  context.fillText('KreaKlone scaffold canvas', 72, 110);
  context.font = '20px Inter, sans-serif';
  context.fillStyle = '#bfdbfe';
  context.fillText('Drag a region, upload a reference, then stream timeline frames.', 72, 146);

  if (state.roi) {
    context.strokeStyle = '#38bdf8';
    context.lineWidth = 5;
    context.setLineDash([18, 10]);
    context.strokeRect(state.roi.x, state.roi.y, state.roi.width, state.roi.height);
    context.setLineDash([]);
  }
}

function upsertFrame(frame) {
  const existing = state.frames.find((entry) => entry.variantId === frame.variantId);
  if (existing) {
    Object.assign(existing, frame);
    return;
  }
  state.frames.push({ ...frame, refined: frame.refined ?? false });
}

function replaceFrames(frames) {
  state.frames = frames.map((frame) => ({ ...frame, refined: frame.refined ?? false }));
}

function renderVariants() {
  elements.variants.innerHTML = '';
  for (const variant of state.frames) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `variant-card${variant.variantId === state.selectedVariantId ? ' selected' : ''}`;
    card.innerHTML = `
      <img src="${variant.uri}" alt="${variant.variantId}" />
      <strong>${variant.variantId}</strong>
      <span>Seed ${variant.seed} • Frame ${variant.ordinal + 1}</span>
      <span>${variant.refined ? 'Refined frame' : 'Live frame'}</span>
    `;
    card.addEventListener('click', () => selectVariant(variant));
    elements.variants.append(card);
  }
}

function syncUi() {
  elements.connectButton.textContent = state.connected ? 'Reconnect session' : 'Connect session';
  elements.generateButton.disabled = !state.connected;
  elements.cancelButton.disabled = !state.connected;
  elements.upscaleButton.disabled = !state.selectedAssetId;
  elements.playButton.disabled = state.frames.length < 2;
  elements.pauseButton.disabled = !state.playbackTimer;
  elements.loopButton.disabled = state.frames.length < 2;
  elements.recordButton.disabled = !state.selectedAssetId;
  elements.sessionIdLabel.textContent = state.sessionId ?? '—';
  elements.sessionVersionLabel.textContent = String(state.sessionVersion);
  elements.roiLabel.textContent = state.roi ? `${state.roi.x},${state.roi.y} • ${state.roi.width}×${state.roi.height}` : 'full frame';
  elements.burstLabel.textContent = `${elements.burstInput.value} frames`;
  renderVariants();
  drawStage();
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? `request failed: ${response.status}`);
  }
  return data;
}

function sendSocket(type, payload) {
  if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
    return;
  }
  state.websocket.send(JSON.stringify({ type, payload }));
}

function applyServerState(payload) {
  state.sessionVersion = payload.version;
  state.roi = payload.session.activeRoi;
  state.activeFrameId = payload.session.activeFrameId ?? state.activeFrameId;
  if (Array.isArray(payload.session.timelineFrames) && payload.session.timelineFrames.length > 0) {
    replaceFrames(payload.session.timelineFrames.map((frame) => ({
      variantId: frame.frameId,
      ordinal: frame.ordinal ?? 0,
      seed: frame.seed ?? 0,
      assetId: frame.assetId,
      uri: state.frames.find((entry) => entry.variantId === frame.frameId)?.uri ?? '',
      refined: false
    })));
  }
  if (payload.session.latestUpscaledAssetId) {
    state.latestUpscaleAssetId = payload.session.latestUpscaledAssetId;
  }
  if (payload.session.latestRecordingAssetId) {
    state.latestRecordingAssetId = payload.session.latestRecordingAssetId;
  }
  syncUi();
}

async function connectSession() {
  const sessionResponse = await jsonFetch('/api/sessions', { method: 'POST', body: JSON.stringify({}) });
  state.sessionId = sessionResponse.session.sessionId;
  state.sessionVersion = sessionResponse.session.version;

  if (state.websocket) {
    state.websocket.close();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.websocket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  state.websocket.addEventListener('open', () => {
    state.connected = true;
    log(`Connected to ${state.sessionId}`);
    sendSocket('session.join', { sessionId: state.sessionId });
    syncUi();
  });
  state.websocket.addEventListener('close', () => {
    state.connected = false;
    syncUi();
  });
  state.websocket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    switch (message.type) {
      case 'session.state':
        applyServerState(message.payload);
        break;
      case 'preview.started':
        log(`Preview stream started (${message.payload.burstCount} frames budget)`);
        break;
      case 'preview.partial': {
        upsertFrame({ ...message.payload, refined: false });
        state.activeFrameId = message.payload.variantId;
        state.selectedAssetId ??= message.payload.assetId;
        syncUi();
        break;
      }
      case 'preview.completed':
        log(`Preview stream complete for job ${message.payload.jobId}`);
        break;
      case 'timeline.frame':
        log(`Timeline frame ${message.payload.frameId} appended`);
        break;
      case 'timeline.snapshot':
        if (Array.isArray(message.payload.frames)) {
          replaceFrames(message.payload.frames.map((frame) => ({
            variantId: frame.frameId,
            ordinal: frame.ordinal ?? 0,
            seed: frame.seed ?? 0,
            assetId: frame.assetId,
            uri: state.frames.find((entry) => entry.variantId === frame.frameId)?.uri ?? '',
            refined: false
          })));
          syncUi();
        }
        log(`Timeline snapshot updated`);
        break;
      case 'refine.completed': {
        const variant = state.variants.find((entry) => entry.variantId === message.payload.sourceVariantId);
        if (variant) {
          variant.uri = message.payload.uri;
          variant.assetId = message.payload.assetId;
          variant.refined = true;
        }
        state.selectedAssetId = message.payload.assetId;
        log(`Refine completed for ${message.payload.sourceVariantId}`);
        syncUi();
        break;
      }
      case 'upscale.completed':
        state.selectedAssetId = message.payload.assetId;
        state.latestUpscaleAssetId = message.payload.assetId;
        log(`Upscale completed: ${message.payload.assetId}`);
        syncUi();
        break;
      case 'record.completed':
        state.latestRecordingAssetId = message.payload.assetId;
        log(`Recording completed: ${message.payload.assetId}`);
        syncUi();
        break;
      case 'job.canceled':
        log(`Canceled ${message.payload.jobId}: ${message.payload.reason}`);
        break;
      case 'job.failed':
        log(`Job failed ${message.payload.jobId}: ${message.payload.error}`);
        break;
      default:
        break;
    }
  });
}

function selectVariant(variant) {
  state.selectedVariantId = variant.variantId;
  state.activeFrameId = variant.variantId;
  state.selectedAssetId = variant.assetId;
  syncUi();
  jsonFetch('/api/refine', {
    method: 'POST',
    body: JSON.stringify({ sessionId: state.sessionId, variantId: variant.variantId })
  }).then(() => {
    log(`Queued refine for ${variant.variantId}`);
  }).catch((error) => log(error.message));
}

function stopPlayback() {
  if (state.playbackTimer) {
    window.clearInterval(state.playbackTimer);
    state.playbackTimer = undefined;
  }
  if (state.sessionId) {
    sendSocket('timeline.pause', { sessionId: state.sessionId });
  }
  syncUi();
}

function startPlayback() {
  stopPlayback();
  if (state.frames.length < 2) {
    return;
  }
  if (state.sessionId) {
    sendSocket('timeline.play', { sessionId: state.sessionId });
  }
  state.playbackTimer = window.setInterval(() => {
    state.playbackIndex = (state.playbackIndex + 1) % state.frames.length;
    const frame = state.frames[state.playbackIndex];
    if (!frame) {
      return;
    }
    state.selectedVariantId = frame.variantId;
    state.activeFrameId = frame.variantId;
    state.selectedAssetId = frame.assetId;
    if (state.sessionId) {
      sendSocket('timeline.seek', { sessionId: state.sessionId, frameId: frame.variantId });
    }
    syncUi();
  }, 250);
  log('Timeline playback started');
  syncUi();
}

function toggleLoop() {
  state.loopEnabled = !state.loopEnabled;
  if (state.sessionId) {
    if (state.loopEnabled && state.frames.length >= 2) {
      sendSocket('timeline.loop.set', {
        sessionId: state.sessionId,
        startFrameId: state.frames[0].variantId,
        endFrameId: state.frames[state.frames.length - 1].variantId
      });
    } else {
      sendSocket('timeline.loop.clear', { sessionId: state.sessionId });
    }
  }
  log(state.loopEnabled ? 'Loop enabled' : 'Loop disabled');
  syncUi();
}

function recordOutput() {
  if (!state.selectedAssetId || !state.sessionId) {
    return;
  }
  sendSocket('record.start', { sessionId: state.sessionId, source: 'output' });
  log(`Recording requested from frame ${state.activeFrameId ?? state.selectedVariantId ?? 'current'}`);
}

function debouncePromptSend() {
  clearTimeout(state.promptTimer);
  state.promptTimer = setTimeout(() => {
    if (!state.sessionId) {
      return;
    }
    sendSocket('canvas.event', {
      sessionId: state.sessionId,
      event: {
        type: 'prompt.update',
        positive: elements.promptInput.value,
        negative: elements.negativePromptInput.value
      }
    });
    log('Prompt updated');
  }, 180);
}

async function uploadReference(file) {
  if (!file || !state.sessionId) {
    return;
  }

  const uri = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const asset = await jsonFetch('/api/assets/upload', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, uri, mimeType: file.type || 'image/png' })
  });

  sendSocket('canvas.event', {
    sessionId: state.sessionId,
    event: {
      type: 'reference.add',
      assetId: asset.assetId,
      uri: asset.uri
    }
  });

  sendSocket('canvas.event', {
    sessionId: state.sessionId,
    event: {
      type: 'image.import',
      assetId: asset.assetId,
      uri: asset.uri,
      x: 128,
      y: 128
    }
  });
  log(`Uploaded reference ${asset.assetId}`);
}

function canvasPoint(event) {
  const bounds = elements.canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * elements.canvas.width;
  const y = ((event.clientY - bounds.top) / bounds.height) * elements.canvas.height;
  return { x: Math.max(0, Math.min(elements.canvas.width, x)), y: Math.max(0, Math.min(elements.canvas.height, y)) };
}

function sendRegion(roi) {
  if (!state.sessionId) {
    return;
  }
  state.roi = roi;
  sendSocket('canvas.event', {
    sessionId: state.sessionId,
    event: { type: 'region.set', ...roi }
  });
  log(`Region set to ${roi.width}×${roi.height}`);
  syncUi();
}

function beginDrag(event) {
  state.dragStart = canvasPoint(event);
}

function updateDrag(event) {
  if (!state.dragStart) {
    return;
  }
  const point = canvasPoint(event);
  state.roi = {
    x: Math.round(Math.min(state.dragStart.x, point.x)),
    y: Math.round(Math.min(state.dragStart.y, point.y)),
    width: Math.max(64, Math.round(Math.abs(point.x - state.dragStart.x))),
    height: Math.max(64, Math.round(Math.abs(point.y - state.dragStart.y)))
  };
  syncUi();
}

function finishDrag(event) {
  if (!state.dragStart) {
    return;
  }
  updateDrag(event);
  sendRegion(state.roi);
  state.dragStart = undefined;
}

elements.connectButton.addEventListener('click', () => {
  connectSession().catch((error) => log(error.message));
});

elements.generateButton.addEventListener('click', () => {
  state.frames = [];
  sendSocket('preview.request', {
    sessionId: state.sessionId,
    burstCount: Number(elements.burstInput.value)
  });
  syncUi();
});

elements.cancelButton.addEventListener('click', () => {
  sendSocket('preview.cancel', { sessionId: state.sessionId, queue: 'all' });
});
elements.playButton.addEventListener('click', startPlayback);
elements.pauseButton.addEventListener('click', stopPlayback);
elements.loopButton.addEventListener('click', toggleLoop);
elements.recordButton.addEventListener('click', recordOutput);

elements.upscaleButton.addEventListener('click', () => {
  if (!state.selectedAssetId) {
    return;
  }
  jsonFetch('/api/upscale', {
    method: 'POST',
    body: JSON.stringify({ sessionId: state.sessionId, assetId: state.selectedAssetId })
  }).then(() => {
    log(`Queued upscale for ${state.selectedAssetId}`);
  }).catch((error) => log(error.message));
});

elements.promptInput.addEventListener('input', debouncePromptSend);

elements.negativePromptInput.addEventListener('input', debouncePromptSend);

elements.burstInput.addEventListener('input', syncUi);

elements.fileInput.addEventListener('change', (event) => {
  uploadReference(event.target.files?.[0]).catch((error) => log(error.message));
});

elements.canvas.addEventListener('pointerdown', beginDrag);

elements.canvas.addEventListener('pointermove', updateDrag);

elements.canvas.addEventListener('pointerup', finishDrag);

elements.canvas.addEventListener('pointerleave', () => {
  state.dragStart = undefined;
});

syncUi();
