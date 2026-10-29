import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Small helpers for calling wrangler from the scripts (locally or on GitHub Actions). */
export const WORKER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DB_NAME = 'hearfinch-dialogue';
/** Set D1_LOCAL=1 to work against wrangler's local D1 copy instead of Cloudflare (for testing). */
export const WHERE = process.env.D1_LOCAL ? '--local' : '--remote';

/** Runs wrangler, streaming its output. Exits the script if it fails. */
export function wrangler(args: string[]) {
  const r = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: WORKER_DIR });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Runs wrangler and returns its stdout. Exits the script if it fails. */
export function wranglerOutput(args: string[]): string {
  const r = spawnSync('npx', ['wrangler', ...args], { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? '');
    process.stdout.write(r.stdout ?? '');
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

/** Runs one SQL query against the remote D1 database and returns its rows. */
export function d1Query<T>(sql: string): T[] {
  const out = wranglerOutput(['d1', 'execute', DB_NAME, WHERE, '--json', '--command', sql]);
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[];
  return parsed.flatMap((p) => p.results ?? []);
}
