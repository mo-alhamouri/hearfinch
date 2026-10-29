import { aiGuess } from './providers/aiGuess.js';
import { dialogue } from './providers/dialogue.js';
import { fingerprint } from './providers/fingerprint.js';
import { podcasts } from './providers/podcasts.js';
import { transcribe } from './providers/transcribe.js';
import type { ClipContext, Env, IdentifyResponse, Provider } from './types.js';

/**
 * The order matters:
 *  1. Fingerprinting is fast and exact, and covers songs and commercials.
 *  2. If that misses, the clip is probably speech: transcribe it once, then
 *     match the words against film/TV dialogue and podcast transcripts.
 *  3. If nothing matches, ask an AI model for a labelled best guess.
 */
const MATCHERS: Provider[] = [fingerprint, dialogue, podcasts, aiGuess];

/** Below this confidence a match is dropped and the next step is tried. */
const MIN_CONFIDENCE = 0.55;

export async function runPipeline(ctx: ClipContext): Promise<IdentifyResponse> {
  const note = (step: string, outcome: string) => ctx.debug?.steps.push({ step, outcome });

  for (const provider of MATCHERS) {
    if (!provider.enabled(ctx.env)) {
      note(provider.name, 'off (keys not set)');
      continue;
    }

    // Steps after fingerprinting need the transcript; make it once, lazily.
    if (provider !== fingerprint && ctx.transcript === undefined && transcribe.enabled(ctx.env)) {
      const t = await safe(() => transcribe.run(ctx));
      ctx.transcript = t.ok ? t.value : '';
      note('transcribe', t.ok ? `${ctx.transcript.split(/\s+/).filter(Boolean).length} words` : `failed: ${t.error}`);
      if (ctx.debug) ctx.debug.transcript = ctx.transcript;
    }

    const r = await safe(() => provider.identify(ctx));
    if (!r.ok) {
      note(provider.name, `failed: ${r.error}`);
      continue;
    }
    const result = r.value;
    if (!result) {
      note(provider.name, 'no match');
      continue;
    }
    if (result.confidence < MIN_CONFIDENCE) {
      note(provider.name, `"${result.title}" at ${Math.round(result.confidence * 100)}% (below ${MIN_CONFIDENCE * 100}%)`);
      continue;
    }
    note(provider.name, `matched "${result.title}" at ${Math.round(result.confidence * 100)}%`);
    return { status: 'match', result, debug: ctx.debug };
  }
  return { status: 'no_match', debug: ctx.debug };
}

export function providerStatus(env: Env) {
  return {
    ...Object.fromEntries(MATCHERS.map((p) => [p.name, p.enabled(env)])),
    transcribe: transcribe.enabled(env),
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    console.error(err);
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}
