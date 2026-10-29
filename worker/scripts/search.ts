/**
 * Try the local dialogue index from the command line:
 *   npm run search -- "a line of dialogue you remember"
 */
import { searchLocal, stats } from './lib/localdb.js';

const text = process.argv.slice(2).join(' ');
if (!text) {
  console.log('Local index holds:', stats());
  console.log('Usage: npm run search -- "<some dialogue>"');
  process.exit(0);
}
const hits = searchLocal(text);
if (!hits.length) console.log('No match.');
for (const h of hits) console.log(`${(h.score * 100).toFixed(0).padStart(3)}%  ${h.mediaType.padEnd(5)}  ${h.title}  (tmdb ${h.tmdbId})`);
