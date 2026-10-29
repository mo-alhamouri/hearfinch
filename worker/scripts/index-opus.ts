/**
 * Builds the local dialogue index in bulk from the OPUS OpenSubtitles corpus
 * (https://opus.nlpl.eu/OpenSubtitles), a research collection of ~3.7M
 * subtitle files from opensubtitles.org, organised by year and IMDb id.
 *
 * 1. Download the English monolingual XML release from the OPUS page and unzip it.
 * 2. Point this script at the folder that contains the year folders:
 *
 *    npm run index:opus -- --dir ~/data/OpenSubtitles/xml/en --limit 5000 --from-year 1990
 *
 * Files live at <year>/<imdb number>/<subtitle id>.xml(.gz). Each IMDb id is
 * looked up on TMDB once (episodes resolve to their series) and cached.
 * Re-running skips anything already indexed. Then: npm run d1:push
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';

import { parseOpusXml, toChunks } from '../src/dialogue/text.js';
import { findByImdb } from '../src/providers/tmdb.js';
import { addChunks, openDb, stats, upsertTitle, wasIngested } from './lib/localdb.js';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    limit: { type: 'string', default: '1000' },
    'from-year': { type: 'string', default: '1970' },
    'files-per-title': { type: 'string', default: '1' },
  },
});

const TMDB = process.env.TMDB_API_KEY;
if (!values.dir || !TMDB) {
  console.error('Usage: npm run index:opus -- --dir <path to OpenSubtitles/xml/en> [--limit 1000] [--from-year 1970]');
  console.error('Needs TMDB_API_KEY in worker/.dev.vars to turn IMDb ids into titles.');
  process.exit(1);
}

const root = values.dir.replace(/^~/, process.env.HOME ?? '');
const limit = Number(values.limit);
const fromYear = Number(values['from-year']);
const perTitle = Number(values['files-per-title']);

const db = openDb();
const getMap = db.prepare('SELECT tmdb_id, media_type, title, year FROM imdb_map WHERE imdb_id = ?');
const setMap = db.prepare('INSERT OR REPLACE INTO imdb_map VALUES (?, ?, ?, ?, ?)');

async function resolveTitle(imdbId: string) {
  const c = getMap.get(imdbId) as { tmdb_id: number | null; media_type: 'movie' | 'tv'; title: string; year: number | null } | undefined;
  if (c) return c.tmdb_id ? { tmdbId: c.tmdb_id, mediaType: c.media_type, title: c.title, year: c.year } : null;
  const found = await findByImdb(TMDB!, imdbId).catch(() => null);
  setMap.run(imdbId, found?.tmdbId ?? null, found?.mediaType ?? null, found?.title ?? null, found?.year ?? null);
  return found;
}

const isDir = (p: string) => statSync(p).isDirectory();
let processed = 0;

outer: for (const year of readdirSync(root).filter((y) => /^\d{4}$/.test(y) && Number(y) >= fromYear).sort().reverse()) {
  for (const imdbNum of readdirSync(join(root, year)).filter((d) => isDir(join(root, year, d)))) {
    if (processed >= limit) break outer;
    const files = readdirSync(join(root, year, imdbNum)).filter((f) => /\.xml(\.gz)?$/.test(f)).slice(0, perTitle);
    const todo = files.filter((f) => !wasIngested(`opus:${imdbNum}/${f}`));
    if (!todo.length) continue;
    processed++;

    const imdbId = `tt${imdbNum.padStart(7, '0')}`;
    const title = await resolveTitle(imdbId);
    if (!title) continue;
    const titleId = upsertTitle({ ...title, imdbId, source: 'opus' });

    for (const f of todo) {
      const raw = readFileSync(join(root, year, imdbNum, f));
      const xml = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8');
      const chunks = toChunks(parseOpusXml(xml));
      if (chunks.length) addChunks(titleId, chunks, `opus:${imdbNum}/${f}`);
    }
    if (processed % 50 === 0) console.log(`${processed} titles…`, stats());
  }
}

console.log('\nDone. Local index now holds:', stats(), '\nPush it to Cloudflare with: npm run d1:push');
