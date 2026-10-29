import { CANDIDATE_SQL, ftsQuery, keywordsFor, rankTitles, type ChunkRow } from '../dialogue/text.js';
import type { ClipContext, Env, IdentifyResult, Provider } from '../types.js';
import { getMovie, getSeries } from './tmdb.js';

/**
 * Movies and TV: match what was said against the dialogue index in D1
 * (built locally and pushed with `npm run d1:push`; see worker/README.md),
 * then fetch the title's details and where-to-watch from TMDB.
 *
 * Only the title is returned — never the scene, episode or timestamp.
 */
export const dialogue: Provider = {
  name: 'dialogue',
  enabled: (env: Env) => Boolean(env.DB && env.TMDB_API_KEY),

  async identify({ transcript, region, env, debug }: ClipContext): Promise<IdentifyResult | null> {
    // A handful of words is too little to tell films apart.
    if (!transcript || transcript.split(/\s+/).length < 6) return null;
    const keywords = keywordsFor(transcript);
    if (!keywords) return null;

    const { results } = await env.DB!.prepare(CANDIDATE_SQL).bind(ftsQuery(keywords)).all<ChunkRow>();
    const ranked = rankTitles(transcript, keywords, results);
    if (debug) debug.candidates = ranked.map((h) => ({ title: h.title, type: h.mediaType, score: Math.round(h.score * 100) / 100 }));
    const [top, second] = ranked;
    if (!top) return null;
    // If two titles are nearly tied, we don't really know which it is.
    const confidence = second && top.score - second.score < 0.08 ? top.score * 0.85 : top.score;
    const key = env.TMDB_API_KEY!;

    if (top.mediaType === 'movie') {
      const m = await getMovie(key, top.tmdbId, region);
      return {
        id: crypto.randomUUID(),
        kind: 'movie',
        title: m.title,
        subtitle: ['Movie', m.year, m.genres[0]].filter(Boolean).join(' · '),
        about: m.overview,
        confidence,
        method: 'dialogue_match',
        artworkUrl: m.posterUrl,
        details: [...m.people, ...(m.providers.length ? [{ label: 'Streaming on', value: m.providers.join(', ') }] : [])],
        links: m.watchUrl ? [{ label: 'Where to watch', url: m.watchUrl }] : [],
      };
    }

    const s = await getSeries(key, top.tmdbId, region);
    return {
      id: crypto.randomUUID(),
      kind: 'series',
      title: s.title,
      subtitle: ['TV series', s.year && `${s.year}–`, s.genres[0]].filter(Boolean).join(' · '),
      about: s.overview,
      confidence,
      method: 'dialogue_match',
      artworkUrl: s.posterUrl,
      details: [
        ...s.people,
        { label: 'Seasons', value: String(s.seasons) },
        ...(s.providers.length ? [{ label: 'Streaming on', value: s.providers.join(', ') }] : []),
      ],
      links: s.watchUrl ? [{ label: 'Where to watch', url: s.watchUrl }] : [],
    };
  },
};
