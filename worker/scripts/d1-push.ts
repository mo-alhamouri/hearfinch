/**
 * Copies the local dialogue index (data/dialogue.db) to Cloudflare D1.
 *
 *   npm run d1:push              # replace D1 with the local index (local index is the source of truth)
 *   npm run d1:push -- --append  # add only what's new since `d1:pull` (used by the GitHub workflow)
 *   npm run d1:push -- --dry     # only write the SQL files to data/d1/
 *
 * D1 caps a single SQL statement at 100 KB, so rows go in batches.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { openDb, stats } from './lib/localdb.js';
import { DB_NAME, WHERE, WORKER_DIR, wrangler } from './lib/wrangler.js';

const OUT = resolve(WORKER_DIR, 'data/d1');
const MAX_STATEMENT = 90_000;
const ROWS_PER_FILE = 20_000;
const dry = process.argv.includes('--dry');
const append = process.argv.includes('--append');

const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const db = openDb();
let fileNo = 0;
const write = (name: string, sql: string) => writeFileSync(join(OUT, `${String(++fileNo).padStart(4, '0')}-${name}.sql`), sql);

function writeBatches(prefix: string, rows: string[], header: string) {
  let statements: string[] = [];
  let current: string[] = [];
  let size = header.length;
  const flushStatement = () => {
    if (current.length) statements.push(`${header}\n${current.join(',\n')};`);
    current = [];
    size = header.length;
  };
  const flushFile = () => {
    flushStatement();
    if (statements.length) write(prefix, statements.join('\n'));
    statements = [];
  };
  rows.forEach((r, i) => {
    if (size + r.length > MAX_STATEMENT) flushStatement();
    current.push(r);
    size += r.length + 2;
    if ((i + 1) % ROWS_PER_FILE === 0) flushFile();
  });
  flushFile();
}

type TitleRow = { id: number; tmdb_id: number; media_type: string; imdb_id: string | null; title: string; year: number | null; source: string; sources: number };
const allTitles = db.prepare('SELECT id, tmdb_id, media_type, imdb_id, title, year, source, sources FROM titles').all() as TitleRow[];

let newTitles = allTitles;
if (append) {
  const hasRemote = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'remote_titles'").get();
  if (!hasRemote) {
    console.error('Run `npm run d1:pull` before `d1:push --append`.');
    process.exit(1);
  }
  const remote = new Map(
    (db.prepare('SELECT id, sources FROM remote_titles').all() as { id: number; sources: number }[]).map((r) => [r.id, r.sources]),
  );
  newTitles = allTitles.filter((t) => !remote.has(t.id));
  const grown = allTitles.filter((t) => remote.has(t.id) && t.sources > (remote.get(t.id) ?? 0));
  if (grown.length) write('sources', grown.map((t) => `UPDATE titles SET sources = ${t.sources} WHERE id = ${t.id};`).join('\n'));
} else {
  write('reset', 'DELETE FROM chunks;\nDELETE FROM titles;\nDELETE FROM ingested;\n');
}

writeBatches(
  'titles',
  newTitles.map((t) => `(${[t.id, t.tmdb_id, t.media_type, t.imdb_id, t.title, t.year, t.source, t.sources].map(q).join(', ')})`),
  'INSERT INTO titles (id, tmdb_id, media_type, imdb_id, title, year, source, sources) VALUES',
);

// In append mode the local index is fresh, so every local chunk is new.
const chunks = db.prepare('SELECT text, title_id FROM chunks').all() as { text: string; title_id: number }[];
writeBatches('chunks', chunks.map((c) => `(${q(c.text)}, ${c.title_id})`), 'INSERT INTO chunks (text, title_id) VALUES');

// In append mode, only the keys D1 doesn't have yet.
const hasRemoteKeys = append && db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'remote_ingested'").get();
const keys = db
  .prepare(
    hasRemoteKeys
      ? 'SELECT source_key FROM ingested WHERE source_key NOT IN (SELECT source_key FROM remote_ingested)'
      : 'SELECT source_key FROM ingested',
  )
  .all() as { source_key: string }[];
writeBatches('ingested', keys.map((k) => `(${q(k.source_key)})`), 'INSERT OR IGNORE INTO ingested (source_key) VALUES');

const files = readdirSync(OUT).sort();
console.log(`Wrote ${files.length} SQL files (${newTitles.length} new titles, ${chunks.length} chunks) for`, stats());
if (dry || files.length === 0) process.exit(0);

console.log('Making sure the D1 tables exist…');
wrangler(['d1', 'migrations', 'apply', DB_NAME, WHERE]);
for (const f of files) {
  console.log(`Uploading ${f}…`);
  wrangler(['d1', 'execute', DB_NAME, WHERE, '--yes', `--file=${join(OUT, f)}`]);
}
console.log('Done. The Worker now matches against the updated index.');
