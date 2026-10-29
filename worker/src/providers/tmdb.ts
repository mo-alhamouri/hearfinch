/**
 * Movie and TV metadata from TMDB, including where to watch in the user's
 * region. Uses a TMDB API read access token (v4). Plain fetch, so it runs both
 * in the Worker and in the Node indexing scripts.
 * TMDB's terms require crediting them on the site (see the About page).
 */
const BASE = 'https://api.themoviedb.org/3';

async function get<T>(apiKey: string, path: string): Promise<T> {
  // Accepts either TMDB credential: the long "API Read Access Token" (sent as a
  // Bearer header) or the short 32-character "API Key" (sent as ?api_key=).
  const key = apiKey.trim();
  const isV3Key = /^[0-9a-f]{32}$/i.test(key);
  const url = isV3Key ? `${BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${key}` : `${BASE}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!isV3Key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface ListedTitle {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
}

/** One page (20 titles) of a TMDB list such as popular or top_rated. */
export async function listTitles(apiKey: string, mediaType: 'movie' | 'tv', list: 'popular' | 'top_rated', page: number): Promise<ListedTitle[]> {
  const r = await get<{ results: { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string }[] }>(
    apiKey,
    `/${mediaType}/${list}?language=en-US&page=${page}`,
  );
  return r.results.map((t) => ({
    tmdbId: t.id,
    mediaType,
    title: t.title ?? t.name ?? 'Untitled',
    year: Number((t.release_date ?? t.first_air_date ?? '').slice(0, 4)) || null,
  }));
}

/** Maps an IMDb id to a TMDB title. TV episodes resolve to their series. */
export async function findByImdb(apiKey: string, imdbId: string): Promise<ListedTitle | null> {
  const r = await get<{
    movie_results: { id: number; title: string; release_date?: string }[];
    tv_results: { id: number; name: string; first_air_date?: string }[];
    tv_episode_results: { show_id: number }[];
  }>(apiKey, `/find/${imdbId}?external_source=imdb_id`);
  const m = r.movie_results[0];
  if (m) return { tmdbId: m.id, mediaType: 'movie', title: m.title, year: Number(m.release_date?.slice(0, 4)) || null };
  const t = r.tv_results[0];
  if (t) return { tmdbId: t.id, mediaType: 'tv', title: t.name, year: Number(t.first_air_date?.slice(0, 4)) || null };
  const e = r.tv_episode_results[0];
  if (e) {
    const s = await get<{ name: string; first_air_date?: string }>(apiKey, `/tv/${e.show_id}`);
    return { tmdbId: e.show_id, mediaType: 'tv', title: s.name, year: Number(s.first_air_date?.slice(0, 4)) || null };
  }
  return null;
}

export interface TitleInfo {
  title: string;
  year?: string;
  overview: string;
  genres: string[];
  people: { label: string; value: string }[];
  posterUrl?: string;
  watchUrl?: string;
  providers: string[];
}

type Credits = { cast: { name: string }[]; crew: { name: string; job: string }[] };
type Watch = { results: Record<string, { link: string; flatrate?: { provider_name: string }[] }> };

const poster = (p?: string) => (p ? `https://image.tmdb.org/t/p/w500${p}` : undefined);
const starring = (c: Credits) => {
  const names = c.cast.slice(0, 3).map((p) => p.name);
  return names.length ? [{ label: 'Starring', value: names.join(', ') }] : [];
};

export async function getMovie(apiKey: string, id: number, region: string): Promise<TitleInfo> {
  const m = await get<{
    title: string;
    release_date?: string;
    overview: string;
    genres: { name: string }[];
    poster_path?: string;
    credits: Credits;
    'watch/providers': Watch;
  }>(apiKey, `/movie/${id}?append_to_response=credits,watch/providers`);
  const where = m['watch/providers'].results[region];
  const director = m.credits.crew.find((c) => c.job === 'Director')?.name;
  return {
    title: m.title,
    year: m.release_date?.slice(0, 4),
    overview: m.overview,
    genres: m.genres.map((g) => g.name),
    people: [...(director ? [{ label: 'Director', value: director }] : []), ...starring(m.credits)],
    posterUrl: poster(m.poster_path),
    watchUrl: where?.link,
    providers: where?.flatrate?.map((p) => p.provider_name) ?? [],
  };
}

export async function getSeries(apiKey: string, id: number, region: string): Promise<TitleInfo & { seasons: number }> {
  const s = await get<{
    name: string;
    first_air_date?: string;
    overview: string;
    number_of_seasons: number;
    genres: { name: string }[];
    poster_path?: string;
    created_by: { name: string }[];
    credits: Credits;
    'watch/providers': Watch;
  }>(apiKey, `/tv/${id}?append_to_response=credits,watch/providers`);
  const where = s['watch/providers'].results[region];
  return {
    title: s.name,
    year: s.first_air_date?.slice(0, 4),
    overview: s.overview,
    genres: s.genres.map((g) => g.name),
    people: [
      ...(s.created_by.length ? [{ label: 'Created by', value: s.created_by.map((c) => c.name).join(', ') }] : []),
      ...starring(s.credits),
    ],
    posterUrl: poster(s.poster_path),
    watchUrl: where?.link,
    providers: where?.flatrate?.map((p) => p.provider_name) ?? [],
    seasons: s.number_of_seasons,
  };
}
