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
  for (const provider of MATCHERS) {
    if (!provider.enabled(ctx.env)) continue;

    // Steps after fingerprinting need the transcript; make it once, lazily.
    if (provider !== fingerprint && ctx.transcript === undefined && transcribe.enabled(ctx.env)) {
      ctx.transcript = (await safe(() => transcribe.run(ctx))) ?? '';
    }

    const result = await safe(() => provider.identify(ctx));
    if (result && result.confidence >= MIN_CONFIDENCE) return { status: 'match', result };
  }
  return { status: 'no_match' };
}

export function providerStatus(env: Env) {
  return {
    ...Object.fromEntries(MATCHERS.map((p) => [p.name, p.enabled(env)])),
    transcribe: transcribe.enabled(env),
  };
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    return null;
  }
}
