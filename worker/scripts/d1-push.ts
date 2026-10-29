/**
 * Copies the local dialogue index (data/dialogue.db) to Cloudflare D1.
 *
 *   npm run d1:push            # writes SQL files, then uploads them with wrangler
 *   npm run d1:push -- --dry   # only writes the SQL files to data/d1/
 *
 * Each push replaces what's in D1, so the local index is the source of truth.
 * D1 caps a single SQL statement at 100 KB, so rows go in batches.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb, stats } from './lib/localdb.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../data/d1');
const DB_NAME = 'hearfinch-dialogue';
const MAX_STATEMENT = 90_000;
const ROWS_PER_FILE = 20_000;
const dry = process.argv.includes('--dry');

const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const db = openDb();
let fileNo = 0;

function writeBatches(prefix: string, rows: string[], header: string) {
  let statements: string[] = [];
  let current: string[] = [];
  let size = 0;
  const flushStatement = () => {
    if (current.length) statements.push(`${header}\n${current.join(',\n')};`);
    current = [];
    size = header.length;
  };
  const flushFile = () => {
    flushStatement();
    if (statements.length) writeFileSync(join(OUT, `${String(++fileNo).padStart(4, '0')}-${prefix}.sql`), statements.join('\n'));
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

writeFileSync(join(OUT, '0000-reset.sql'), 'DELETE FROM chunks;\nDELETE FROM titles;\n');

const titles = db.prepare('SELECT id, tmdb_id, media_type, imdb_id, title, year, source, sources FROM titles').all() as {
  id: number;
  tmdb_id: number;
  media_type: string;
  imdb_id: string | null;
  title: string;
  year: number | null;
  source: string;
  sources: number;
}[];
writeBatches(
  'titles',
  titles.map((t) => `(${[t.id, t.tmdb_id, t.media_type, t.imdb_id, t.title, t.year, t.source, t.sources].map(q).join(', ')})`),
  'INSERT INTO titles (id, tmdb_id, media_type, imdb_id, title, year, source, sources) VALUES',
);

const chunks = db.prepare('SELECT text, title_id FROM chunks').all() as { text: string; title_id: number }[];
writeBatches('chunks', chunks.map((c) => `(${q(c.text)}, ${c.title_id})`), 'INSERT INTO chunks (text, title_id) VALUES');

const files = readdirSync(OUT).sort();
console.log(`Wrote ${files.length} SQL files to ${OUT} for`, stats());
if (dry) process.exit(0);

console.log('Creating tables in D1 (safe to repeat)…');
run(['d1', 'migrations', 'apply', DB_NAME, '--remote']);
for (const f of files) {
  console.log(`Uploading ${f}…`);
  run(['d1', 'execute', DB_NAME, '--remote', '--yes', `--file=${join(OUT, f)}`]);
}
console.log('Done. The Worker now matches against the new index.');

function run(args: string[]) {
  const r = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: resolve(here, '..') });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
