import type { ClipContext, Env, IdentifyResult, Provider } from '../types.js';

/**
 * Songs and commercials via ACRCloud audio fingerprinting.
 * - Songs come from ACRCloud's music catalog (`metadata.music`).
 * - Commercials come from your own "custom files" bucket of ad audio
 *   (`metadata.custom_files`), uploaded to ACRCloud with brand/campaign/url fields.
 * ACRCloud accepts the WebM/Opus and MP4 clips browsers record.
 */
interface AcrMusic {
  title: string;
  artists?: { name: string }[];
  album?: { name: string };
  release_date?: string;
  genres?: { name: string }[];
  score?: number;
}

interface AcrCustom {
  title?: string;
  brand?: string;
  campaign?: string;
  url?: string;
  score?: number;
}

async function hmacSha1Base64(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return btoa(String.fromCharCode(...sig));
}

export const fingerprint: Provider = {
  name: 'fingerprint',
  enabled: (env: Env) => Boolean(env.ACRCLOUD_HOST && env.ACRCLOUD_ACCESS_KEY && env.ACRCLOUD_ACCESS_SECRET),

  async identify({ audio, mimeType, env }: ClipContext): Promise<IdentifyResult | null> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toSign = ['POST', '/v1/identify', env.ACRCLOUD_ACCESS_KEY, 'audio', '1', timestamp].join('\n');
    const signature = await hmacSha1Base64(env.ACRCLOUD_ACCESS_SECRET!, toSign);

    const form = new FormData();
    form.append('sample', new Blob([audio], { type: mimeType }), 'clip');
    form.append('sample_bytes', String(audio.byteLength));
    form.append('access_key', env.ACRCLOUD_ACCESS_KEY!);
    form.append('data_type', 'audio');
    form.append('signature_version', '1');
    form.append('signature', signature);
    form.append('timestamp', timestamp);

    const res = await fetch(`https://${env.ACRCLOUD_HOST}/v1/identify`, { method: 'POST', body: form });
    const json = (await res.json()) as { status?: { code: number }; metadata?: { music?: AcrMusic[]; custom_files?: AcrCustom[] } };
    if (json.status?.code !== 0) return null;

    const ad = json.metadata?.custom_files?.[0];
    if (ad) {
      const details: { label: string; value: string }[] = [];
      if (ad.brand) details.push({ label: 'Brand', value: ad.brand });
      if (ad.campaign) details.push({ label: 'Campaign', value: ad.campaign });
      return {
        id: crypto.randomUUID(),
        kind: 'ad',
        title: ad.title ?? 'Commercial',
        subtitle: ['Commercial', ad.brand].filter(Boolean).join(' · '),
        about: ad.campaign ? `Part of ${ad.brand ?? 'the brand'}’s ${ad.campaign} campaign.` : 'A commercial from our ad library.',
        confidence: (ad.score ?? 100) / 100,
        method: 'ad_fingerprint',
        details,
        links: ad.url ? [{ label: 'Visit the brand', url: ad.url }] : [],
      };
    }

    const song = json.metadata?.music?.[0];
    if (!song) return null;
    const artist = song.artists?.map((a) => a.name).join(', ') ?? 'Unknown artist';
    const year = song.release_date?.slice(0, 4);
    const genre = song.genres?.[0]?.name;
    const query = encodeURIComponent(`${song.title} ${artist}`);
    return {
      id: crypto.randomUUID(),
      kind: 'song',
      title: song.title,
      subtitle: [artist, song.album?.name && `${song.album.name}${year ? ` (${year})` : ''}`].filter(Boolean).join(' · '),
      about: genre ? `A ${genre.toLowerCase()} track by ${artist}.` : `A track by ${artist}.`,
      confidence: (song.score ?? 100) / 100,
      method: 'audio_fingerprint',
      details: [
        { label: 'Artist', value: artist },
        ...(song.album?.name ? [{ label: 'Album', value: song.album.name }] : []),
        ...(year ? [{ label: 'Released', value: year }] : []),
      ],
      links: [
        { label: 'Search on Spotify', url: `https://open.spotify.com/search/${query}` },
        { label: 'Search on YouTube', url: `https://www.youtube.com/results?search_query=${query}` },
      ],
    };
  },
};
