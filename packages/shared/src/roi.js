export const DEFAULT_STAGE = Object.freeze({ width: 1024, height: 1024 });
export const ROI_BUCKET_SIZE = 64;
export const ROI_PADDING = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function bucketDimension(value, bucketSize = ROI_BUCKET_SIZE) {
  return Math.max(bucketSize, Math.ceil(value / bucketSize) * bucketSize);
}

export function normalizeRoi(roi, stage = DEFAULT_STAGE) {
  const x = clamp(Math.floor(roi.x), 0, stage.width - 1);
  const y = clamp(Math.floor(roi.y), 0, stage.height - 1);
  const maxWidth = stage.width - x;
  const maxHeight = stage.height - y;
  const width = clamp(bucketDimension(roi.width), ROI_BUCKET_SIZE, maxWidth);
  const height = clamp(bucketDimension(roi.height), ROI_BUCKET_SIZE, maxHeight);
  return { x, y, width, height };
}

export function boundsFromPoints(points) {
  const xs = [];
  const ys = [];
  for (let index = 0; index < points.length; index += 2) {
    xs.push(points[index]);
    ys.push(points[index + 1]);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

export function padRoi(roi, padding = ROI_PADDING, stage = DEFAULT_STAGE) {
  return normalizeRoi(
    {
      x: roi.x - padding,
      y: roi.y - padding,
      width: roi.width + padding * 2,
      height: roi.height + padding * 2
    },
    stage
  );
}

export function deriveRoiForCanvasEvent(canvasEvent, sessionState, stage = DEFAULT_STAGE) {
  switch (canvasEvent.type) {
    case "region.set":
      return normalizeRoi(canvasEvent, stage);
    case "mask.update":
    case "brush":
    case "erase":
      return padRoi(boundsFromPoints(canvasEvent.points), ROI_PADDING + Math.ceil((canvasEvent.size ?? 12) / 2), stage);
    case "image.import":
      return normalizeRoi({ x: canvasEvent.x, y: canvasEvent.y, width: stage.width / 2, height: stage.height / 2 }, stage);
    case "prompt.update":
    case "reference.add":
    case "reference.remove":
      return sessionState.activeRoi ?? normalizeRoi({ x: 0, y: 0, width: stage.width, height: stage.height }, stage);
    default:
      return normalizeRoi({ x: 0, y: 0, width: stage.width, height: stage.height }, stage);
  }
}
