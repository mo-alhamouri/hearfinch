/**
 * Builds the local dialogue index from the OpenSubtitles.com API, for the
 * titles on TMDB's popular / top-rated lists.
 *
 *   npm run index:opensubtitles -- --type movie --list popular --pages 5
 *   npm run index:opensubtitles -- --type tv --list top_rated --pages 2 --episodes 4
 *   npm run index:opensubtitles -- --type tv --list both --pages 100 --episodes 1 --until 1000
 *
 * --list both     walks the popular and top-rated lists
 * --start-page N  begins at page N instead of 1
 * --until N       stops once the index holds N shows (or movies, for --type movie)
 * --all-languages includes titles not originally in English (skipped by default,
 *                 since clips are transcribed as English)
 *
 * Safe to re-run: titles and files already indexed are skipped, and the run
 * stops cleanly when the account's daily download quota is used up.
 * Then push to Cloudflare with `npm run d1:push`.
 */
import { parseArgs } from 'node:util';

import { parseSrt, toChunks } from '../src/dialogue/text.js';
import { listTitles, type ListedTitle } from '../src/providers/tmdb.js';
import { addChunks, markIngested, stats, titleSourceCount, upsertTitle, wasIngested } from './lib/localdb.js';
import { downloadSubtitle, login, openSubtitlesEnabled, QuotaExceeded, searchSubtitles, type SubtitleFile } from './lib/opensubtitles.js';

const { values } = parseArgs({
  options: {
    type: { type: 'string', default: 'movie' }, // movie | tv | both
    list: { type: 'string', default: 'popular' }, // popular | top_rated
    pages: { type: 'string', default: '1' }, // 20 titles per page
    episodes: { type: 'string', default: '3' }, // episodes per series
    'start-page': { type: 'string', default: '1' },
    until: { type: 'string', default: '0' }, // 0 = no target
    'all-languages': { type: 'boolean', default: false },
  },
});

const TMDB = process.env.TMDB_API_KEY;
if (!openSubtitlesEnabled() || !TMDB) {
  console.error('Set OPENSUBTITLES_API_KEY, OPENSUBTITLES_USERNAME, OPENSUBTITLES_PASSWORD and TMDB_API_KEY in worker/.dev.vars');
  process.exit(1);
}

const types = values.type === 'both' ? (['movie', 'tv'] as const) : ([values.type as 'movie' | 'tv'] as const);
const lists = values.list === 'both' ? (['popular', 'top_rated'] as const) : ([values.list as 'popular' | 'top_rated'] as const);
const startPage = Math.max(1, Number(values['start-page']) || 1);
const pages = Math.max(1, Number(values.pages) || 1);
const perSeries = Math.max(1, Number(values.episodes) || 1);
const until = Number(values.until) || 0;
const englishOnly = !values['all-languages'];

const indexedCount = (type: 'movie' | 'tv') => (type === 'movie' ? stats().movies : stats().series);

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
  if (englishOnly && t.language && t.language !== 'en') return `skipped (originally in "${t.language}")`;
  const noSubsKey = `nosubs:${t.mediaType}:${t.tmdbId}`;
  if (wasIngested(noSubsKey)) return 'no English subtitles (checked before)';

  const files = await searchSubtitles(t.mediaType, t.tmdbId);
  const picks = t.mediaType === 'movie' ? files.slice(0, 1) : pickEpisodes(files, wanted);
  if (!picks.length) {
    markIngested(noSubsKey);
    return 'no English subtitles found';
  }

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
  nextType: for (const type of types) {
    if (until && indexedCount(type) >= until) {
      console.log(`Already holds ${indexedCount(type)} ${type === 'movie' ? 'movies' : 'shows'} (target ${until}).`);
      continue;
    }
    for (const list of lists) {
      for (let page = startPage; page < startPage + pages; page++) {
        const listed = await listTitles(TMDB, type, list, page);
        if (!listed.length) break; // past the end of the list
        for (const t of listed) {
          const status = await indexTitle(t).catch((e: unknown) => {
            if (e instanceof QuotaExceeded) throw e;
            return `error: ${e instanceof Error ? e.message : e}`;
          });
          console.log(`${type === 'movie' ? 'Movie ' : 'Series'}  ${t.title} (${t.year ?? '?'})  ${status}`);
          if (until && indexedCount(type) >= until) {
            console.log(`\nReached the target of ${until} ${type === 'movie' ? 'movies' : 'shows'}.`);
            continue nextType;
          }
        }
      }
    }
  }
} catch (e) {
  if (e instanceof QuotaExceeded) console.log('\nDaily download quota reached. Run again tomorrow to continue where this left off.');
  else throw e;
}
console.log('\nLocal index now holds:', stats(), '\nPush it to Cloudflare with: npm run d1:push');
