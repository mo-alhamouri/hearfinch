/**
 * Finds the hearfinch-dialogue D1 database on the Cloudflare account
 * (creating it the first time) and writes its id into wrangler.jsonc, so
 * nobody has to copy the id by hand. Used by the GitHub workflows; safe to
 * run locally too after `npx wrangler login`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DB_NAME, WORKER_DIR, wrangler, wranglerOutput } from './lib/wrangler.js';

function findId(): string | undefined {
  const out = wranglerOutput(['d1', 'list', '--json']);
  const list = JSON.parse(out.slice(out.indexOf('['))) as { name: string; uuid: string }[];
  return list.find((d) => d.name === DB_NAME)?.uuid;
}

let id = findId();
if (!id) {
  console.log(`Creating D1 database ${DB_NAME}…`);
  wrangler(['d1', 'create', DB_NAME]);
  id = findId();
}
if (!id) {
  console.error(`Couldn't find or create the ${DB_NAME} database.`);
  process.exit(1);
}

const file = join(WORKER_DIR, 'wrangler.jsonc');
const config = readFileSync(file, 'utf8');
writeFileSync(file, config.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${id}"`));
console.log(`Using D1 database ${DB_NAME} (${id}).`);
