import type { ClipContext, Env } from '../types.js';

/**
 * Speech-to-text, run once per clip and shared by the dialogue, podcast and
 * AI-guess steps.
 *
 * 1. Cloudflare Workers AI (Whisper large v3 turbo) — runs inside the Worker,
 *    needs no key, and the free plan covers about 200 minutes of audio a day.
 * 2. OpenAI's transcription API — used only if Workers AI isn't available and
 *    OPENAI_API_KEY is set (pay as you go).
 */
export const transcribe = {
  enabled: (env: Env) => Boolean(env.AI || env.OPENAI_API_KEY),
  engine: (env: Env) => (env.AI ? 'workers-ai' : env.OPENAI_API_KEY ? 'openai' : 'off'),

  async run(ctx: ClipContext): Promise<string> {
    return ctx.env.AI ? runWorkersAi(ctx) : runOpenAi(ctx);
  },
};

async function runWorkersAi({ audio, env }: ClipContext): Promise<string> {
  const res = await env.AI!.run('@cf/openai/whisper-large-v3-turbo', {
    audio: toBase64(audio),
    task: 'transcribe',
    language: 'en',
  });
  return (res.text ?? '').trim();
}

async function runOpenAi({ audio, mimeType, env }: ClipContext): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), `clip.${ext}`);
  form.append('model', env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1');
  form.append('response_format', 'text');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (res.status === 429) throw new Error('OpenAI refused the request (429): usually no credit on the account, or too many requests');
  if (!res.ok) throw new Error(`OpenAI transcription failed: ${res.status}`);
  return (await res.text()).trim();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
