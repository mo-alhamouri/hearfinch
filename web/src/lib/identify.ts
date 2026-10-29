import { API_URL, DEMO } from '../config';
import type { IdentifyResponse } from '../types';
import { mockIdentify } from './mock';
import { getTurnstileToken } from './turnstile';

export class IdentifyError extends Error {
  constructor(
    public kind: 'rate-limit' | 'bot-check' | 'network' | 'server',
    message: string,
  ) {
    super(message);
  }
}

/** Sends a clip to the Hearfinch API (or the built-in samples in demo mode). */
export async function identify(clip: Blob, region: string, signal: AbortSignal): Promise<IdentifyResponse> {
  if (DEMO) return mockIdentify(signal);

  const token = await getTurnstileToken().catch(() => {
    throw new IdentifyError('bot-check', 'We couldn’t confirm you’re human. Reload the page and try again.');
  });

  const ext = clip.type.includes('mp4') ? 'mp4' : clip.type.includes('ogg') ? 'ogg' : 'webm';
  const body = new FormData();
  body.append('audio', clip, `clip.${ext}`);
  body.append('region', region);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/identify`, {
      method: 'POST',
      body,
      signal,
      headers: token ? { 'CF-Turnstile-Response': token } : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new IdentifyError('network', 'We couldn’t reach Hearfinch. Check your connection and try again.');
  }
  if (res.status === 429) throw new IdentifyError('rate-limit', 'That’s a lot of listening! Give it a minute, then try again.');
  if (res.status === 403) throw new IdentifyError('bot-check', 'We couldn’t confirm you’re human. Reload the page and try again.');
  if (!res.ok) throw new IdentifyError('server', 'Something went wrong on our side. Please try again.');
  return (await res.json()) as IdentifyResponse;
}
