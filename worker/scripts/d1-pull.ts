/**
 * Copies the list of indexed titles and subtitle files from Cloudflare D1
 * into a fresh local index, so the indexer skips what's already there.
 * Chunks (the dialogue itself) stay in D1 — only the bookkeeping is pulled.
 *
 * Used by the "Dialogue index" workflow, followed by `d1:push --append`.
 */
import { openDb, stats } from './lib/localdb.js';
import { d1Query } from './lib/wrangler.js';

type RemoteTitle = { id: number; tmdb_id: number; media_type: string; imdb_id: string | null; title: string; year: number | null; source: string; sources: number };

const db = openDb();
db.exec(`
  DROP TABLE IF EXISTS remote_titles;
  CREATE TABLE remote_titles (id INTEGER PRIMARY KEY, sources INTEGER NOT NULL);
`);

const titles = d1Query<RemoteTitle>('SELECT id, tmdb_id, media_type, imdb_id, title, year, source, sources FROM titles');
const keys = d1Query<{ source_key: string }>('SELECT source_key FROM ingested');

const insertTitle = db.prepare(
  'INSERT OR REPLACE INTO titles (id, tmdb_id, media_type, imdb_id, title, year, source, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const insertRemote = db.prepare('INSERT INTO remote_titles (id, sources) VALUES (?, ?)');
const insertKey = db.prepare('INSERT OR IGNORE INTO ingested (source_key) VALUES (?)');

db.exec('BEGIN');
for (const t of titles) {
  insertTitle.run(t.id, t.tmdb_id, t.media_type, t.imdb_id, t.title, t.year, t.source, t.sources);
  insertRemote.run(t.id, t.sources);
}
for (const k of keys) insertKey.run(k.source_key);
db.exec('COMMIT');

console.log(`Pulled ${titles.length} titles and ${keys.length} indexed files from D1.`, stats());
