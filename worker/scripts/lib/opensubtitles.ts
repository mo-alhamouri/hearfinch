/**
 * Minimal client for the OpenSubtitles.com REST API.
 * Docs: https://opensubtitles.stoplight.io/docs/opensubtitles-api
 *
 * You need an API consumer key (opensubtitles.com → Profile → API consumers)
 * and an account. Downloads are counted against that account's daily quota,
 * so the indexer stops cleanly when the quota runs out and resumes next run.
 */
const BASE = 'https://api.opensubtitles.com/api/v1';
const { OPENSUBTITLES_API_KEY, OPENSUBTITLES_USERNAME, OPENSUBTITLES_PASSWORD } = process.env;
const USER_AGENT = process.env.OPENSUBTITLES_USER_AGENT ?? 'Hearfinch v0.1';

export class QuotaExceeded extends Error {}

export const openSubtitlesEnabled = () => Boolean(OPENSUBTITLES_API_KEY && OPENSUBTITLES_USERNAME && OPENSUBTITLES_PASSWORD);

let token: string | null = null;
let base = BASE;
let lastCall = 0;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Stay well under the documented rate limit.
  const wait = lastCall + 300 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Api-Key': OPENSUBTITLES_API_KEY!,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 406 || res.status === 429) {
    const body = await res.text();
    if (/quota|download/i.test(body) || res.status === 406) throw new QuotaExceeded(body);
  }
  if (!res.ok) throw new Error(`OpenSubtitles ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function login() {
  const r = await call<{ token: string; base_url?: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ username: OPENSUBTITLES_USERNAME, password: OPENSUBTITLES_PASSWORD }),
  });
  token = r.token;
  // VIP accounts are sent to a different host.
  if (r.base_url) base = `https://${r.base_url.replace(/^https?:\/\//, '')}/api/v1`;
}

export interface SubtitleFile {
  fileId: number;
  downloads: number;
  season?: number;
  episode?: number;
}

interface SearchResponse {
  data: {
    attributes: {
      download_count: number;
      ai_translated?: boolean;
      machine_translated?: boolean;
      hearing_impaired?: boolean;
      files: { file_id: number }[];
      feature_details?: { season_number?: number; episode_number?: number };
    };
  }[];
}

/**
 * English subtitles for a movie, or for episodes of a series (pass the
 * series' TMDB id). Sorted by download count, machine translations dropped.
 */
export async function searchSubtitles(mediaType: 'movie' | 'tv', tmdbId: number): Promise<SubtitleFile[]> {
  const params = new URLSearchParams({
    languages: 'en',
    order_by: 'download_count',
    ...(mediaType === 'movie' ? { tmdb_id: String(tmdbId), type: 'movie' } : { parent_tmdb_id: String(tmdbId), type: 'episode' }),
  });
  const r = await call<SearchResponse>(`/subtitles?${params}`);
  return r.data
    .filter((s) => !s.attributes.ai_translated && !s.attributes.machine_translated && s.attributes.files.length)
    .map((s) => ({
      fileId: s.attributes.files[0].file_id,
      downloads: s.attributes.download_count,
      season: s.attributes.feature_details?.season_number,
      episode: s.attributes.feature_details?.episode_number,
    }));
}

/** Downloads one subtitle file as SRT text. Uses one unit of the daily quota. */
export async function downloadSubtitle(fileId: number): Promise<{ srt: string; remaining: number }> {
  const r = await call<{ link: string; remaining: number }>('/download', {
    method: 'POST',
    body: JSON.stringify({ file_id: fileId, sub_format: 'srt' }),
  });
  const file = await fetch(r.link);
  if (!file.ok) throw new Error(`Subtitle file download failed: ${file.status}`);
  return { srt: await file.text(), remaining: r.remaining };
}
