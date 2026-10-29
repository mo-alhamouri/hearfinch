import type { IdentifyResponse, IdentifyResult } from '../types';

/** Fictional sample results for demo mode (no VITE_API_URL). */
const SAMPLES: Omit<IdentifyResult, 'id'>[] = [
  {
    kind: 'movie',
    title: 'The Last Lighthouse',
    subtitle: 'Movie · 2024 · Drama',
    about:
      'A retired keeper returns to a remote island to restore the lighthouse he abandoned decades ago — and the family he left with it.',
    confidence: 0.94,
    method: 'dialogue_match',
    details: [
      { label: 'Director', value: 'Mara Ellison' },
      { label: 'Starring', value: 'Theo Grant, Ana Ruiz' },
      { label: 'Streaming on', value: 'Parallax+' },
    ],
    links: [{ label: 'Where to watch', url: 'https://www.themoviedb.org/' }],
  },
  {
    kind: 'song',
    title: 'Neon Harbor',
    subtitle: 'Lumen Avenue · Afterglow (2025)',
    about: 'The lead single from Lumen Avenue’s second album, a bright synth-pop track about late nights by the water.',
    confidence: 0.99,
    method: 'audio_fingerprint',
    details: [
      { label: 'Artist', value: 'Lumen Avenue' },
      { label: 'Album', value: 'Afterglow' },
      { label: 'Released', value: '2025' },
    ],
    links: [
      { label: 'Search on Spotify', url: 'https://open.spotify.com/search/Neon%20Harbor' },
      { label: 'Search on YouTube', url: 'https://www.youtube.com/results?search_query=Neon+Harbor' },
    ],
  },
  {
    kind: 'series',
    title: 'Northbound',
    subtitle: 'TV series · 2023– · Thriller',
    about:
      'Two estranged siblings drive across the country to deliver a package nobody will explain. Every season is a new road and a new secret.',
    confidence: 0.91,
    method: 'dialogue_match',
    details: [
      { label: 'Created by', value: 'Jon Whitlock' },
      { label: 'Seasons', value: '3' },
    ],
    links: [{ label: 'Where to watch', url: 'https://www.themoviedb.org/' }],
  },
  {
    kind: 'ad',
    title: 'Volta EV — “Quiet Roads”',
    subtitle: 'Commercial · Volta Motors',
    about: 'Part of Volta Motors’ Fall 2026 campaign for its new electric hatchback.',
    confidence: 0.96,
    method: 'ad_fingerprint',
    details: [
      { label: 'Brand', value: 'Volta Motors' },
      { label: 'Campaign', value: 'Fall 2026' },
    ],
    links: [],
  },
  {
    kind: 'guess',
    title: 'Live basketball broadcast',
    subtitle: 'Play-by-play commentary with crowd noise',
    about: 'It sounds like a live game broadcast, with a play-by-play announcer and an arena crowd.',
    confidence: 0.62,
    method: 'ai_guess',
    heardText: '“…pull-up from the elbow, and it’s good! Tied with a minute to go.”',
    note: 'We couldn’t find an exact match, so here’s our best guess based on what we heard.',
    details: [{ label: 'Audio type', value: 'Sports commentary' }],
    links: [],
  },
];

let cursor = 0;

/** Cycles through the samples, with a "no match" every sixth try. */
export async function mockIdentify(signal: AbortSignal): Promise<IdentifyResponse> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 1400);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Cancelled', 'AbortError'));
    });
  });
  const i = cursor++;
  if (i % 6 === 5) return { status: 'no_match' };
  return { status: 'match', result: { ...SAMPLES[i % SAMPLES.length], id: crypto.randomUUID() } };
}
