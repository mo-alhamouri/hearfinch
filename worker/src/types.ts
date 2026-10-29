// Keep in sync with web/src/types.ts.

export type Kind = 'song' | 'movie' | 'series' | 'podcast' | 'ad' | 'guess';
export type MatchMethod = 'audio_fingerprint' | 'dialogue_match' | 'transcript_match' | 'ad_fingerprint' | 'ai_guess';

export interface IdentifyResult {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  about: string;
  confidence: number;
  method: MatchMethod;
  artworkUrl?: string;
  details: { label: string; value: string }[];
  links: { label: string; url: string }[];
  heardText?: string;
  note?: string;
}

/** Extra detail returned when the website asks for it (Settings → Show what Hearfinch heard). */
export interface DebugInfo {
  transcript?: string;
  steps: { step: string; outcome: string }[];
  candidates?: { title: string; type: string; score: number }[];
}

export type IdentifyResponse = ({ status: 'match'; result: IdentifyResult } | { status: 'no_match' }) & { debug?: DebugInfo };

/** Bindings and secrets, configured in wrangler.jsonc and with `wrangler secret put`. */
export interface Env {
  DB?: D1Database;
  IDENTIFY_LIMITER?: RateLimit;
  ALLOWED_ORIGINS?: string;
  ACRCLOUD_HOST?: string;
  ACRCLOUD_ACCESS_KEY?: string;
  ACRCLOUD_ACCESS_SECRET?: string;
  OPENAI_API_KEY?: string;
  OPENAI_TRANSCRIBE_MODEL?: string;
  TMDB_API_KEY?: string;
  PODCASTINDEX_KEY?: string;
  PODCASTINDEX_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  TURNSTILE_SECRET?: string;
}

export interface ClipContext {
  /** Raw audio bytes. Held in memory for this request only — never stored. */
  audio: Uint8Array;
  mimeType: string;
  region: string;
  env: Env;
  /** Filled in once speech-to-text has run, so later steps can reuse it. */
  transcript?: string;
  /** Present when the caller asked for debug detail. */
  debug?: DebugInfo;
}

/** One step in the identification pipeline. Returns null to pass to the next step. */
export interface Provider {
  name: string;
  /** False when the provider's keys or bindings aren't configured. */
  enabled(env: Env): boolean;
  identify(ctx: ClipContext): Promise<IdentifyResult | null>;
}
