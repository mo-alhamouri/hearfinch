import { TURNSTILE_SITE_KEY } from '../config';

/**
 * Cloudflare Turnstile: a privacy-friendly bot check, so scripts can't burn
 * through the paid identification APIs. Runs invisibly; only shows a
 * challenge when Cloudflare is unsure. Off when no site key is configured.
 */
interface Turnstile {
  render(el: HTMLElement | string, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
let widgetId: string | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

function load(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile failed to load')));
    s.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(s);
  });
  return loading;
}

/** Returns a single-use token to send with the next request, or null when Turnstile is off. */
export async function getTurnstileToken(): Promise<string | null> {
  if (!TURNSTILE_SITE_KEY) return null;
  const ts = await load();
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    if (widgetId === null) {
      widgetId = ts.render('#turnstile', {
        sitekey: TURNSTILE_SITE_KEY,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token: string) => pending?.resolve(token),
        'error-callback': () => pending?.reject(new Error('turnstile')),
      });
    } else {
      ts.reset(widgetId);
    }
    ts.execute(widgetId);
  });
}
