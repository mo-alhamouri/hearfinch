/**
 * Records a short clip from the microphone in whatever format this browser
 * supports (WebM/Opus in Chrome, Edge and Firefox; MP4/AAC in Safari).
 * The microphone is released as soon as the clip ends.
 */
export type RecorderErrorKind = 'unsupported' | 'denied' | 'no-device' | 'insecure';

export class RecorderError extends Error {
  constructor(public kind: RecorderErrorKind) {
    super(kind);
  }
}

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export async function recordClip(seconds: number, signal: AbortSignal): Promise<Blob> {
  if (!window.isSecureContext) throw new RecorderError('insecure');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new RecorderError('unsupported');

  let stream: MediaStream;
  try {
    // Turn off voice processing: it muffles music and TV audio.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    throw new RecorderError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'no-device');
  }

  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);

  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000);
      const onAbort = () => {
        clearTimeout(timer);
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      recorder.onstop = () => {
        signal.removeEventListener('abort', onAbort);
        resolve(new Blob(parts, { type: recorder.mimeType || mimeType || 'audio/webm' }));
      };
      recorder.start();
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Current microphone permission, where the browser can tell us without asking. */
export async function micPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}
