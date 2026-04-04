import type { TimelineFrame } from "@/hooks/useYlimitSession";

export function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`Failed to load ${uri}`));
    img.src = uri;
  });
}

/**
 * Export timeline frames to WebM, optionally mixing in an AudioBuffer.
 *
 * Frame timing:
 *   - If frames carry `audioPositionMs`, each frame is held for exactly
 *     (next.audioPositionMs − current.audioPositionMs) ms.  The final frame
 *     is held until `audioTrimOutMs` (if provided) or one average interval.
 *   - If frames lack `audioPositionMs` they are distributed evenly at `fps`.
 *
 * Audio mixing:
 *   - When `audioBuffer` is supplied the audio track is combined with the
 *     canvas video stream before feeding MediaRecorder, producing a WebM with
 *     both streams muxed together.
 *   - `audioOffsetMs` controls where in the audio buffer playback starts.
 *     Defaults to `frames[0].audioPositionMs ?? 0`.
 *   - `audioTrimOutMs` stops the audio source at the specified timestamp so
 *     the output duration exactly matches the [audioOffsetMs, audioTrimOutMs] range.
 */
export async function exportWebM(
  frames: TimelineFrame[],
  fps: number,
  onProgress: (n: number) => void,
  audioBuffer?: AudioBuffer | null,
  audioOffsetMs?: number,
  audioTrimOutMs?: number,
): Promise<Blob> {
  const valid = frames.filter((f) => f.uri);
  if (valid.length === 0) throw new Error("No frames with URI to export");

  const first = await loadImage(valid[0].uri!);
  const w = first.naturalWidth || 1280;
  const h = first.naturalHeight || 720;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  /* ── Compute per-frame hold durations ── */
  const hasPositions = valid.every((f) => typeof f.audioPositionMs === "number");
  let durations: number[];
  if (hasPositions) {
    const positions = valid.map((f) => f.audioPositionMs as number);
    const intervals = positions.slice(1).map((p, i) => p - positions[i]);
    const avg = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : 1000 / fps;
    /* Last frame: hold until audioTrimOutMs if provided, otherwise use avg interval */
    const lastDuration = audioTrimOutMs != null && audioTrimOutMs > positions[positions.length - 1]
      ? audioTrimOutMs - positions[positions.length - 1]
      : avg;
    durations = [...intervals, lastDuration];
  } else {
    const d = 1000 / fps;
    durations = valid.map(() => d);
  }

  /* ── Pick video codec ── */
  const videoMime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  /* ── Build streams, optionally mixing audio ── */
  const canvasStream = (canvas as any).captureStream(fps) as MediaStream;
  let mediaStream: MediaStream = canvasStream;
  let audioCtx: AudioContext | null = null;
  let audioSrc: AudioBufferSourceNode | null = null;

  if (audioBuffer) {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioSrc = audioCtx.createBufferSource();
      audioSrc.buffer = audioBuffer;
      audioSrc.connect(dest);
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        mediaStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          audioTrack,
        ]);
      }
    } catch {
      /* Audio mixing failed — fall back to video-only */
      audioCtx = null;
      audioSrc = null;
      mediaStream = canvasStream;
    }
  }

  /* ── Choose mime: include audio codec when audio is present ── */
  const mimeType = audioSrc
    ? (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : videoMime)
    : videoMime;

  const recorder = new MediaRecorder(mediaStream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(100);

  /* Start audio at the calculated offset; schedule stop at trimOutMs if provided */
  if (audioSrc && audioCtx) {
    const offsetSec = (audioOffsetMs ?? (valid[0].audioPositionMs ?? 0)) / 1000;
    audioSrc.start(audioCtx.currentTime, Math.max(0, offsetSec));
    if (audioTrimOutMs != null) {
      const trimDurationSec = (audioTrimOutMs - (audioOffsetMs ?? 0)) / 1000;
      if (trimDurationSec > 0) {
        audioSrc.stop(audioCtx.currentTime + trimDurationSec);
      }
    }
  }

  /* ── Render frames at correct durations ── */
  for (let i = 0; i < valid.length; i++) {
    const img = await loadImage(valid[i].uri!);
    ctx.drawImage(img, 0, 0, w, h);
    onProgress(Math.round(((i + 1) / valid.length) * 100));
    await new Promise((r) => setTimeout(r, Math.max(30, durations[i])));
  }

  /* ── Clean up audio ── */
  if (audioSrc) { try { audioSrc.stop(); } catch { /* already ended */ } }
  if (audioCtx) { try { await audioCtx.close(); } catch { /* ignore */ } }

  return new Promise((resolve, rej) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    recorder.onerror = rej;
    recorder.stop();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadUri(uri: string, filename: string) {
  const a = document.createElement("a");
  a.href = uri;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadAsJpeg(uri: string, filename: string) {
  try {
    const img = await loadImage(uri);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 1280;
    canvas.height = img.naturalHeight || 720;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch { /* non-blocking */ }
}
