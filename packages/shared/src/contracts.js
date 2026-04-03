const ROI_KEYS = ["x", "y", "width", "height"];

export const QUEUE_NAMES = Object.freeze(["preview", "refine", "upscale"]);

export const CLIENT_EVENT_TYPES = Object.freeze([
  "session.join",
  "canvas.event",
  "preview.request",
  "preview.cancel"
]);

export const SERVER_EVENT_TYPES = Object.freeze([
  "session.state",
  "preview.started",
  "preview.partial",
  "preview.completed",
  "refine.completed",
  "upscale.completed",
  "job.canceled",
  "job.failed"
]);

export const CANVAS_EVENT_TYPES = Object.freeze([
  "brush",
  "erase",
  "mask.update",
  "prompt.update",
  "reference.add",
  "reference.remove",
  "region.set",
  "image.import"
]);

export function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, context) {
  invariant(typeof value === "string" && value.length > 0, `${context} must be a non-empty string`);
}

function assertOptionalString(value, context) {
  if (value !== undefined) {
    assertString(value, context);
  }
}

function assertInteger(value, context) {
  invariant(Number.isInteger(value), `${context} must be an integer`);
}

function assertSessionId(sessionId, context = "sessionId") {
  invariant(typeof sessionId === "string" && sessionId.length >= 8, `${context} must be a non-empty string`);
}

export function assertRoi(roi, context = "roi") {
  invariant(isPlainObject(roi), `${context} must be an object`);
  for (const key of ROI_KEYS) {
    invariant(Number.isFinite(roi[key]), `${context}.${key} must be a finite number`);
  }
  invariant(roi.width > 0 && roi.height > 0, `${context} width and height must be positive`);
}

function assertPrompt(prompt, context = "prompt") {
  invariant(isPlainObject(prompt), `${context} must be an object`);
  assertString(prompt.positive ?? "", `${context}.positive`);
  if (prompt.negative !== undefined) {
    invariant(typeof prompt.negative === "string", `${context}.negative must be a string`);
  }
}

function assertPoints(points, context) {
  invariant(Array.isArray(points) && points.length >= 4 && points.length % 2 === 0, `${context} must be an even-length point list`);
  for (const value of points) {
    invariant(Number.isFinite(value), `${context} entries must be finite numbers`);
  }
}

function assertVariantPayload(payload, context) {
  assertString(payload.jobId, `${context}.jobId`);
  assertSessionId(payload.sessionId, `${context}.sessionId`);
  assertInteger(payload.sessionVersion, `${context}.sessionVersion`);
  assertString(payload.variantId, `${context}.variantId`);
  assertInteger(payload.ordinal, `${context}.ordinal`);
  invariant(Number.isFinite(payload.seed), `${context}.seed must be numeric`);
  assertString(payload.assetId, `${context}.assetId`);
  assertString(payload.uri, `${context}.uri`);
  assertRoi(payload.roi, `${context}.roi`);
}

export function validateCanvasEvent(canvasEvent) {
  invariant(isPlainObject(canvasEvent), "canvas event must be an object");
  invariant(CANVAS_EVENT_TYPES.includes(canvasEvent.type), `unsupported canvas event type: ${canvasEvent.type}`);

  switch (canvasEvent.type) {
    case "brush":
    case "erase":
      assertString(canvasEvent.strokeId, "brush/erase.strokeId");
      assertString(canvasEvent.layerId, "brush/erase.layerId");
      invariant(Number.isFinite(canvasEvent.size) && canvasEvent.size > 0, "brush/erase events require positive size");
      assertPoints(canvasEvent.points, `${canvasEvent.type}.points`);
      break;
    case "mask.update":
      assertString(canvasEvent.maskId, "mask.update.maskId");
      invariant(canvasEvent.mode === "add" || canvasEvent.mode === "subtract", "mask.update mode must be add or subtract");
      assertPoints(canvasEvent.points, "mask.update.points");
      break;
    case "prompt.update":
      invariant(typeof canvasEvent.positive === "string", "prompt.update requires positive prompt");
      if (canvasEvent.negative !== undefined) {
        invariant(typeof canvasEvent.negative === "string", "prompt.update negative must be a string");
      }
      break;
    case "reference.add":
      assertString(canvasEvent.assetId, "reference.add.assetId");
      assertString(canvasEvent.uri, "reference.add.uri");
      break;
    case "reference.remove":
      assertString(canvasEvent.assetId, "reference.remove.assetId");
      break;
    case "region.set":
      assertRoi(canvasEvent, "region.set");
      break;
    case "image.import":
      assertString(canvasEvent.assetId, "image.import.assetId");
      assertString(canvasEvent.uri, "image.import.uri");
      invariant(Number.isFinite(canvasEvent.x) && Number.isFinite(canvasEvent.y), "image.import requires coordinates");
      break;
    default:
      break;
  }

  return canvasEvent;
}

export function validateClientEnvelope(message) {
  invariant(isPlainObject(message), "client message must be an object");
  invariant(CLIENT_EVENT_TYPES.includes(message.type), `unsupported client message type: ${message.type}`);
  invariant(isPlainObject(message.payload), "client message payload must be an object");

  switch (message.type) {
    case "session.join":
      assertSessionId(message.payload.sessionId);
      break;
    case "canvas.event":
      assertSessionId(message.payload.sessionId);
      validateCanvasEvent(message.payload.event);
      break;
    case "preview.request":
      assertSessionId(message.payload.sessionId);
      if (message.payload.burstCount !== undefined) {
        assertInteger(message.payload.burstCount, "preview.request.burstCount");
      }
      break;
    case "preview.cancel":
      assertSessionId(message.payload.sessionId);
      if (message.payload.queue !== undefined) {
        invariant([...QUEUE_NAMES, "all"].includes(message.payload.queue), "preview.cancel queue must be preview/refine/upscale/all");
      }
      break;
    default:
      break;
  }

  return message;
}

export function validateServerEnvelope(message) {
  invariant(isPlainObject(message), "server message must be an object");
  invariant(SERVER_EVENT_TYPES.includes(message.type), `unsupported server message type: ${message.type}`);
  invariant(isPlainObject(message.payload), "server message payload must be an object");

  switch (message.type) {
    case "session.state":
      assertSessionId(message.payload.sessionId, "session.state.sessionId");
      assertInteger(message.payload.version, "session.state.version");
      invariant(isPlainObject(message.payload.session), "session.state.session must be an object");
      invariant(isPlainObject(message.payload.queues), "session.state.queues must be an object");
      break;
    case "preview.started":
      assertString(message.payload.jobId, "preview.started.jobId");
      assertSessionId(message.payload.sessionId, "preview.started.sessionId");
      assertInteger(message.payload.sessionVersion, "preview.started.sessionVersion");
      assertInteger(message.payload.burstCount, "preview.started.burstCount");
      assertRoi(message.payload.roi, "preview.started.roi");
      break;
    case "preview.partial":
      assertVariantPayload(message.payload, "preview.partial");
      break;
    case "preview.completed":
      assertString(message.payload.jobId, "preview.completed.jobId");
      assertSessionId(message.payload.sessionId, "preview.completed.sessionId");
      assertInteger(message.payload.sessionVersion, "preview.completed.sessionVersion");
      assertInteger(message.payload.totalVariants, "preview.completed.totalVariants");
      break;
    case "refine.completed":
    case "upscale.completed":
      assertString(message.payload.jobId, `${message.type}.jobId`);
      assertSessionId(message.payload.sessionId, `${message.type}.sessionId`);
      assertInteger(message.payload.sessionVersion, `${message.type}.sessionVersion`);
      assertString(message.payload.assetId, `${message.type}.assetId`);
      assertString(message.payload.uri, `${message.type}.uri`);
      assertOptionalString(message.payload.sourceVariantId, `${message.type}.sourceVariantId`);
      break;
    case "job.canceled":
      assertString(message.payload.jobId, "job.canceled.jobId");
      assertSessionId(message.payload.sessionId, "job.canceled.sessionId");
      assertString(message.payload.reason, "job.canceled.reason");
      break;
    case "job.failed":
      assertString(message.payload.jobId, "job.failed.jobId");
      assertSessionId(message.payload.sessionId, "job.failed.sessionId");
      assertString(message.payload.error, "job.failed.error");
      break;
    default:
      break;
  }

  return message;
}

export function envelope(type, payload) {
  return { type, payload, emittedAt: new Date().toISOString() };
}

export function parseJsonMessage(value, context = "message") {
  invariant(typeof value === "string", `${context} must be a string`);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${context} must be valid JSON: ${error.message}`);
  }
}

export function isQueueName(value) {
  return QUEUE_NAMES.includes(value);
}

export function clampBurstCount(value, fallback = 4) {
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return Math.min(8, Math.max(1, value));
}

export function normalizeQueueSelection(value) {
  return value === undefined || value === "all" ? "all" : value;
}

export function validatePromptPayload(prompt) {
  assertPrompt(prompt);
  return prompt;
}
