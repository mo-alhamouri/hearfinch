/**
 * Turning subtitle files into searchable text, and normalising what the
 * speech-to-text step heard so both sides compare cleanly.
 */

/** Lower-case words with punctuation, tags and accents stripped. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Cleans one subtitle line: drops styling tags, sound cues, music notes and speaker dashes. */
export function cleanLine(line: string): string {
  return line
    .replace(/<[^>]+>/g, ' ') // <i>, <font …>
    .replace(/\{[^}]*\}/g, ' ') // {\an8}
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // [door slams] (laughs)
    .replace(/[♪♫#]/g, ' ')
    .replace(/^\s*-\s*/, '')
    .replace(/^[A-Z][A-Z .']{1,20}:\s*/, '') // "JOHN: hello"
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses SRT (or WebVTT) into cleaned dialogue lines, in order. */
export function parseSrt(srt: string): string[] {
  const lines: string[] = [];
  for (const raw of srt.replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    if (!l || /^\d+$/.test(l) || l.includes('-->') || l === 'WEBVTT') continue;
    const c = cleanLine(l);
    if (c && /[a-z]/i.test(c)) lines.push(c);
  }
  return dropCredits(lines);
}

/**
 * Parses an OPUS OpenSubtitles XML file: sentences are <s> elements holding
 * <w> word tokens (tokenised release) or plain text (raw release).
 */
export function parseOpusXml(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<s\b[^>]*>([\s\S]*?)<\/s>/g)) {
    const inner = m[1];
    const words = [...inner.matchAll(/<w\b[^>]*>([^<]*)<\/w>/g)].map((w) => w[1]);
    const text = words.length ? words.join(' ') : inner.replace(/<[^>]+>/g, ' ');
    const c = cleanLine(decodeEntities(text));
    if (c && /[a-z]/i.test(c)) out.push(c);
  }
  return dropCredits(out);
}

/** Subtitle files often open and close with uploader ads ("Subtitles by …"). */
function dropCredits(lines: string[]): string[] {
  const ad = /(subtitle|subs|sync|corrected|opensubtitles|www\.|\.com|\.org|advertise|support us)/i;
  return lines.filter((l, i) => !(ad.test(l) && (i < 5 || i > lines.length - 6)));
}

function decodeEntities(s: string) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Groups consecutive lines into overlapping windows of roughly `words` words.
 * A 10-second clip holds about 20–35 spoken words, so windows of ~40 words
 * with 50% overlap make sure any clip lands mostly inside one window.
 */
export function toChunks(lines: string[], words = 40): string[] {
  const chunks: string[] = [];
  const step = Math.max(1, Math.floor(words / 2));
  const tokens = lines.join(' ').split(/\s+/);
  for (let i = 0; i < tokens.length; i += step) {
    const slice = tokens.slice(i, i + words);
    if (slice.length >= 8) chunks.push(slice.join(' '));
    if (i + words >= tokens.length) break;
  }
  return chunks;
}

/** Very common words that tell titles apart poorly. */
export const STOPWORDS = new Set(
  (
    'a an the and or but if of to in on at by for with from as is are was were be been being am i you he she it we they me him her ' +
    'us them my your his its our their this that these those there here what which who whom whose do does did doing have has had ' +
    'not no yes so just oh okay ok yeah uh um hey well all any can will would could should shall may might must get got go going ' +
    'gonna wanna know like now then than too very really dont im youre its thats whats lets cant wont didnt isnt'
  ).split(' '),
);

export type MediaType = 'movie' | 'tv';

export interface ChunkRow {
  text: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
}

export interface DialogueHit {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  /** 0–1: how much of what was heard appears in this title's dialogue. */
  score: number;
}

/** Distinctive words from a transcript, used to pull candidate windows. Null if too few. */
export function keywordsFor(transcript: string): string[] | null {
  const keywords = [...new Set(tokenize(transcript).filter((w) => !STOPWORDS.has(w) && w.length > 1))];
  return keywords.length >= 3 ? keywords : null;
}

/** FTS5 MATCH expression: any of the keywords. */
export const ftsQuery = (keywords: string[]) => keywords.map((w) => `"${w}"`).join(' OR ');

/** SQL shared by the Worker (D1) and the local index: the 60 best candidate windows. */
export const CANDIDATE_SQL = `SELECT c.text AS text, t.tmdb_id AS tmdbId, t.media_type AS mediaType, t.title AS title
  FROM chunks c JOIN titles t ON t.id = c.title_id
  WHERE chunks MATCH ? ORDER BY bm25(chunks) LIMIT 60`;

/**
 * Ranks titles for a transcript, given candidate windows from full-text search.
 * Each window is scored, windows are grouped by title, and the best window
 * wins — nudged up when the same title has several matching windows.
 */
export function rankTitles(transcript: string, keywords: string[], rows: ChunkRow[], limit = 5): DialogueHit[] {
  const heard = tokenize(transcript);
  const byTitle = new Map<string, { hit: DialogueHit; best: number; count: number }>();
  for (const r of rows) {
    const s = overlap(heard, keywords, tokenize(r.text));
    const key = `${r.mediaType}:${r.tmdbId}`;
    const cur = byTitle.get(key);
    if (!cur) {
      byTitle.set(key, { hit: { tmdbId: r.tmdbId, mediaType: r.mediaType, title: r.title, score: 0 }, best: s, count: s > 0.3 ? 1 : 0 });
    } else {
      cur.best = Math.max(cur.best, s);
      if (s > 0.3) cur.count++;
    }
  }
  return [...byTitle.values()]
    .map(({ hit, best, count }) => ({ ...hit, score: Math.min(1, best + Math.min(0.1, 0.03 * Math.max(0, count - 1))) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Scores how well a window of dialogue explains what was heard.
 * Shared vocabulary alone is weak evidence (lots of films say "we need to
 * go"), so most of the score comes from word *pairs* heard back-to-back that
 * also sit next to each other in the window. A gap of up to 3 words is
 * allowed because speech-to-text drops and mishears words.
 */
function overlap(heard: string[], keywords: string[], chunk: string[]): number {
  const positions = new Map<string, number[]>();
  chunk.forEach((w, i) => positions.set(w, [...(positions.get(w) ?? []), i]));
  const kwHit = keywords.filter((w) => positions.has(w)).length / keywords.length;

  let pairs = 0;
  let found = 0;
  for (let k = 0; k + 1 < heard.length; k++) {
    pairs++;
    const a = positions.get(heard[k]);
    const b = positions.get(heard[k + 1]);
    if (a && b && a.some((i) => b.some((j) => j - i >= 1 && j - i <= 3))) found++;
  }
  const pairHit = pairs ? found / pairs : 0;
  return 0.25 * kwHit + 0.75 * pairHit;
}
