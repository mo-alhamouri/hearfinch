import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { CANDIDATE_SQL, ftsQuery, keywordsFor, rankTitles, type ChunkRow, type MediaType } from '../../src/dialogue/text.js';

/**
 * A local copy of the dialogue index (data/dialogue.db), built on your
 * computer with Node's built-in SQLite, then pushed to Cloudflare D1 with
 * `npm run d1:push`. Same schema as migrations/0001_dialogue.sql.
 */
const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = resolve(process.env.DIALOGUE_DB_PATH ?? resolve(here, '../../data/dialogue.db'));
const SCHEMA = readFileSync(resolve(here, '../../migrations/0001_dialogue.sql'), 'utf8');

let db: DatabaseSync | null = null;

export function openDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Local-only bookkeeping, not pushed to D1.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingested (source_key TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS imdb_map (imdb_id TEXT PRIMARY KEY, tmdb_id INTEGER, media_type TEXT, title TEXT, year INTEGER);
  `);
  return db;
}

export function upsertTitle(t: { tmdbId: number; mediaType: MediaType; imdbId?: string; title: string; year?: number | null; source: string }) {
  const d = openDb();
  d.prepare(
    `INSERT INTO titles (tmdb_id, media_type, imdb_id, title, year, source) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (media_type, tmdb_id) DO UPDATE SET title = excluded.title`,
  ).run(t.tmdbId, t.mediaType, t.imdbId ?? null, t.title, t.year ?? null, t.source);
  return (d.prepare('SELECT id FROM titles WHERE media_type = ? AND tmdb_id = ?').get(t.mediaType, t.tmdbId) as { id: number }).id;
}

export function addChunks(titleId: number, chunks: string[], sourceKey: string) {
  const d = openDb();
  const insert = d.prepare('INSERT INTO chunks (text, title_id) VALUES (?, ?)');
  d.exec('BEGIN');
  try {
    for (const c of chunks) insert.run(c, titleId);
    d.prepare('UPDATE titles SET sources = sources + 1 WHERE id = ?').run(titleId);
    d.prepare('INSERT OR IGNORE INTO ingested (source_key) VALUES (?)').run(sourceKey);
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** Records a key without any dialogue, e.g. a title with no English subtitles, so later runs skip it. */
export const markIngested = (key: string) => openDb().prepare('INSERT OR IGNORE INTO ingested (source_key) VALUES (?)').run(key);

export const wasIngested = (key: string) => Boolean(openDb().prepare('SELECT 1 FROM ingested WHERE source_key = ?').get(key));

export function titleSourceCount(mediaType: MediaType, tmdbId: number): number {
  const row = openDb().prepare('SELECT sources FROM titles WHERE media_type = ? AND tmdb_id = ?').get(mediaType, tmdbId) as
    | { sources: number }
    | undefined;
  return row?.sources ?? 0;
}

export function stats() {
  const d = openDb();
  const n = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return {
    movies: n(`SELECT COUNT(*) n FROM titles WHERE media_type = 'movie' AND sources > 0`),
    series: n(`SELECT COUNT(*) n FROM titles WHERE media_type = 'tv' AND sources > 0`),
    chunks: n('SELECT COUNT(*) n FROM chunks'),
  };
}

/** Same matching the Worker runs against D1. */
export function searchLocal(transcript: string) {
  const keywords = keywordsFor(transcript);
  if (!keywords) return [];
  const rows = openDb().prepare(CANDIDATE_SQL).all(ftsQuery(keywords)) as unknown as ChunkRow[];
  return rankTitles(transcript, keywords, rows);
}
