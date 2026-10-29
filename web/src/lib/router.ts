import { useSyncExternalStore } from 'react';

/**
 * Hash routes (#/history, #/r/…) so the site works on GitHub Pages without
 * any server-side rewrites.
 */
export type Route =
  | { name: 'listen' }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'result'; id: string }
  | { name: 'shared'; data: string };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [first, ...rest] = path.split('/');
  switch (first) {
    case 'history':
      return { name: 'history' };
    case 'settings':
      return { name: 'settings' };
    case 'about':
      return { name: 'about' };
    case 'result':
      return rest[0] ? { name: 'result', id: rest[0] } : { name: 'listen' };
    case 'r':
      return rest[0] ? { name: 'shared', data: rest.join('/') } : { name: 'listen' };
    default:
      return { name: 'listen' };
  }
}

const subscribe = (l: () => void) => {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parse(hash);
}

export const href = (path: string) => `#/${path}`;
export const go = (path: string) => {
  location.hash = `/${path}`;
};
