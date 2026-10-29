import type { ClipContext, Env, IdentifyResult, Provider } from '../types.js';

/**
 * Podcasts: match the transcript against podcast transcripts.
 *
 * TODO: Podcast Index exposes episode transcripts (the podcast:transcript tag)
 * for shows that publish them. Ingest those into the same D1 index as film
 * dialogue (a `podcast` media type keyed by Podcast Index feed id), then
 * look up the show with GET /api/1.0/podcasts/byfeedid and return kind
 * 'podcast' with the show's title, author, category and link — the show,
 * never the episode or minute.
 */
export const podcasts: Provider = {
  name: 'podcasts',
  enabled: (env: Env) => Boolean(env.PODCASTINDEX_KEY && env.PODCASTINDEX_SECRET),
  async identify(_ctx: ClipContext): Promise<IdentifyResult | null> {
    return null;
  },
};
