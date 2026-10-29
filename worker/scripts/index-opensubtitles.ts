/**
 * Builds the local dialogue index from the OpenSubtitles.com API, for the
 * titles on TMDB's popular / top-rated lists.
 *
 *   npm run index:opensubtitles -- --type movie --list popular --pages 5
 *   npm run index:opensubtitles -- --type tv --list top_rated --pages 2 --episodes 4
 *
 * Safe to re-run: titles and files already indexed are skipped, and the run
 * stops cleanly when the account's daily download quota is used up.
 * Then push to Cloudflare with `npm run d1:push`.
 */
import { parseArgs } from 'node:util';

import { parseSrt, toChunks } from '../src/dialogue/text.js';
import { listTitles, type ListedTitle } from '../src/providers/tmdb.js';
import { addChunks, stats, titleSourceCount, upsertTitle, wasIngested } from './lib/localdb.js';
import { downloadSubtitle, login, openSubtitlesEnabled, QuotaExceeded, searchSubtitles, type SubtitleFile } from './lib/opensubtitles.js';

const { values } = parseArgs({
  options: {
    type: { type: 'string', default: 'movie' }, // movie | tv | both
    list: { type: 'string', default: 'popular' }, // popular | top_rated
    pages: { type: 'string', default: '1' }, // 20 titles per page
    episodes: { type: 'string', default: '3' }, // episodes per series
  },
});

const TMDB = process.env.TMDB_API_KEY;
if (!openSubtitlesEnabled() || !TMDB) {
  console.error('Set OPENSUBTITLES_API_KEY, OPENSUBTITLES_USERNAME, OPENSUBTITLES_PASSWORD and TMDB_API_KEY in worker/.dev.vars');
  process.exit(1);
}

const types = values.type === 'both' ? (['movie', 'tv'] as const) : ([values.type as 'movie' | 'tv'] as const);
const list = values.list as 'popular' | 'top_rated';
const pages = Number(values.pages);
const perSeries = Number(values.episodes);

/** Spreads picks across seasons so one series isn't represented by a single episode. */
function pickEpisodes(files: SubtitleFile[], n: number): SubtitleFile[] {
  const seen = new Set<string>();
  const unique = files.filter((f) => {
    const k = `${f.season}x${f.episode}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const bySeason = new Map<number, SubtitleFile[]>();
  for (const f of unique) bySeason.set(f.season ?? 0, [...(bySeason.get(f.season ?? 0) ?? []), f]);
  const picks: SubtitleFile[] = [];
  for (let round = 0; picks.length < n; round++) {
    let added = false;
    for (const eps of bySeason.values()) {
      if (eps[round] && picks.length < n) {
        picks.push(eps[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return picks;
}

async function indexTitle(t: ListedTitle) {
  const wanted = t.mediaType === 'movie' ? 1 : perSeries;
  if (titleSourceCount(t.mediaType, t.tmdbId) >= wanted) return 'already indexed';

  const files = await searchSubtitles(t.mediaType, t.tmdbId);
  const picks = t.mediaType === 'movie' ? files.slice(0, 1) : pickEpisodes(files, wanted);
  if (!picks.length) return 'no English subtitles found';

  const titleId = upsertTitle({ ...t, source: 'opensubtitles' });
  let remaining: number | undefined;
  for (const f of picks) {
    const key = `opensubtitles:${f.fileId}`;
    if (wasIngested(key)) continue;
    const dl = await downloadSubtitle(f.fileId);
    remaining = dl.remaining;
    const chunks = toChunks(parseSrt(dl.srt));
    if (chunks.length) addChunks(titleId, chunks, key);
  }
  return `indexed${remaining !== undefined ? ` (${remaining} downloads left today)` : ''}`;
}

await login();
try {
  for (const type of types) {
    for (let page = 1; page <= pages; page++) {
      for (const t of await listTitles(TMDB, type, list, page)) {
        const status = await indexTitle(t).catch((e: unknown) => {
          if (e instanceof QuotaExceeded) throw e;
          return `error: ${e instanceof Error ? e.message : e}`;
        });
        console.log(`${type === 'movie' ? 'Movie ' : 'Series'}  ${t.title} (${t.year ?? '?'})  ${status}`);
      }
    }
  }
} catch (e) {
  if (!(e instanceof QuotaExceeded)) throw e;
  console.log('\nDaily download quota reached. Run again tomorrow to continue where this left off.');
}
console.log('\nLocal index now holds:', stats(), '\nPush it to Cloudflare with: npm run d1:push');
