import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { providerStatus, runPipeline } from './pipeline.js';
import type { Env } from './types.js';

/** ~15 s of browser-recorded Opus/AAC is well under this. */
const MAX_BYTES = 2 * 1024 * 1024;

const app = new Hono<{ Bindings: Env }>();

/** Only the Hearfinch website (and local dev) may call the API from a browser. */
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'CF-Turnstile-Response'],
    maxAge: 86400,
  })(c, next);
});

app.get('/', (c) => c.text('Hearfinch API. POST /identify with an audio clip.'));

app.get('/health', async (c) => {
  let dialogueIndex: { movies: number; shows: number } | false = false;
  if (c.env.DB) {
    try {
      const { results } = await c.env.DB.prepare(
        "SELECT media_type AS type, COUNT(*) AS n FROM titles WHERE sources > 0 GROUP BY media_type",
      ).all<{ type: string; n: number }>();
      dialogueIndex = {
        movies: results.find((r) => r.type === 'movie')?.n ?? 0,
        shows: results.find((r) => r.type === 'tv')?.n ?? 0,
      };
    } catch {
      dialogueIndex = { movies: 0, shows: 0 };
    }
  }
  return c.json({ ok: true, providers: providerStatus(c.env), dialogueIndex });
});

app.post('/identify', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';

  // 1. Rate limit per visitor (configured in wrangler.jsonc).
  if (c.env.IDENTIFY_LIMITER) {
    const { success } = await c.env.IDENTIFY_LIMITER.limit({ key: ip });
    if (!success) return c.json({ error: 'Too many requests. Try again in a minute.' }, 429);
  }

  // 2. Bot check with Cloudflare Turnstile, when a secret is configured.
  if (c.env.TURNSTILE_SECRET) {
    const token = c.req.header('CF-Turnstile-Response');
    if (!token || !(await verifyTurnstile(c.env.TURNSTILE_SECRET, token, ip))) {
      return c.json({ error: 'Human check failed. Reload the page and try again.' }, 403);
    }
  }

  // 3. The clip.
  const form = await c.req.formData();
  const file = form.get('audio');
  if (!(file instanceof File)) return c.json({ error: 'Send the clip as multipart field "audio".' }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: 'Clip is too long.' }, 413);
  const region = String(form.get('region') ?? 'CA').toUpperCase().slice(0, 2);
  // "Show what Hearfinch heard" in the website's Settings: returns the transcript
  // and the closest titles to the person who sent the clip. Nothing is stored.
  const debug = form.get('debug') === '1' ? { steps: [] } : undefined;

  // The clip only lives in memory for the length of this request.
  const audio = new Uint8Array(await file.arrayBuffer());
  const response = await runPipeline({ audio, mimeType: file.type || 'audio/webm', region, env: c.env, debug });
  return c.json(response, 200, { 'Cache-Control': 'no-store' });
});

async function verifyTurnstile(secret: string, token: string, ip: string) {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export default app;
