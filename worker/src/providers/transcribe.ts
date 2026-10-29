import type { ClipContext, Env } from '../types.js';

/**
 * Speech-to-text, run once per clip and shared by the dialogue, podcast and
 * AI-guess steps. Uses OpenAI's transcription endpoint, which accepts the
 * WebM and MP4 audio that browsers record.
 */
export const transcribe = {
  enabled: (env: Env) => Boolean(env.OPENAI_API_KEY),

  async run({ audio, mimeType, env }: ClipContext): Promise<string> {
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
    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
    return (await res.text()).trim();
  },
};
