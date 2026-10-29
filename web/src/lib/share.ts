import type { IdentifyResult } from '../types';

/**
 * Shared results are encoded into the link itself (#/r/<data>), so anyone can
 * open them without an account or a database lookup.
 */
type Shared = Pick<IdentifyResult, 'kind' | 'title' | 'subtitle' | 'about' | 'artworkUrl' | 'details' | 'links'>;

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string) {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function shareUrl(r: IdentifyResult) {
  const payload: Shared = {
    kind: r.kind,
    title: r.title,
    subtitle: r.subtitle,
    about: r.about.length > 280 ? `${r.about.slice(0, 277)}…` : r.about,
    artworkUrl: r.artworkUrl,
    details: r.details.slice(0, 4),
    links: r.links.slice(0, 2),
  };
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/r/${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeShared(data: string): IdentifyResult | null {
  try {
    const p = JSON.parse(fromBase64Url(data)) as Shared;
    if (!p.title || !p.kind) return null;
    // Only allow http(s) links from a shared payload.
    const links = (p.links ?? []).filter((l) => /^https?:\/\//.test(l.url));
    const artworkUrl = p.artworkUrl && /^https:\/\//.test(p.artworkUrl) ? p.artworkUrl : undefined;
    return { ...p, links, artworkUrl, id: 'shared', confidence: 1, method: 'dialogue_match', details: p.details ?? [] };
  } catch {
    return null;
  }
}

/** Uses the system share sheet where there is one, otherwise copies the link. */
export async function shareResult(r: IdentifyResult): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = shareUrl(r);
  const text = `${r.title} — ${r.subtitle}. Identified with Hearfinch.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: r.title, text, url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: days > 300 ? 'numeric' : undefined });
}
