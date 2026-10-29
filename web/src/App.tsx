import { useEffect } from 'react';

import { Icon } from './components/Icon';
import { ResultCard } from './components/ResultCard';
import { Wordmark } from './components/ui';
import { DEMO } from './config';
import { decodeShared } from './lib/share';
import { href, useRoute, type Route } from './lib/router';
import { findInHistory } from './lib/storage';
import { AboutPage } from './pages/AboutPage';
import { HistoryPage } from './pages/HistoryPage';
import { listenFromAnywhere, ListenPage } from './pages/ListenPage';
import { SettingsPage } from './pages/SettingsPage';

const NAV = [
  { path: '', name: 'listen', label: 'Listen', icon: 'wave' },
  { path: 'history', name: 'history', label: 'History', icon: 'clock' },
  { path: 'settings', name: 'settings', label: 'Settings', icon: 'settings' },
  { path: 'about', name: 'about', label: 'About', icon: 'info' },
] as const;

const TITLES: Record<Route['name'], string> = {
  listen: 'Hearfinch — know what you’re hearing',
  history: 'History · Hearfinch',
  settings: 'Settings · Hearfinch',
  about: 'About · Hearfinch',
  result: 'Result · Hearfinch',
  shared: 'Shared find · Hearfinch',
};

export function App() {
  const route = useRoute();

  useEffect(() => {
    document.title = TITLES[route.name];
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route.name]);

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <header className="site-header">
        <a href={href('')} aria-label="Hearfinch home" className="home-link">
          <Wordmark />
        </a>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <a key={n.name} href={href(n.path)} aria-current={route.name === n.name ? 'page' : undefined}>
              <Icon name={n.icon} size={20} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>

      {DEMO && (
        <p className="demo-banner" role="note">
          Demo mode: Hearfinch is showing sample results. Connect the API to identify real audio.
        </p>
      )}

      <main id="main" tabIndex={-1}>
        <Page route={route} />
      </main>

      <footer className="site-footer">
        <span>Hearfinch · know what you’re hearing</span>
        <a href={href('about')}>Privacy &amp; credits</a>
      </footer>
      <div id="turnstile" />
    </>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'history':
      return <HistoryPage />;
    case 'settings':
      return <SettingsPage />;
    case 'about':
      return <AboutPage />;
    case 'result': {
      const result = findInHistory(route.id);
      return (
        <div className="page narrow">
          <a className="back-link" href={href('history')}>
            <Icon name="back" size={18} /> History
          </a>
          {result ? <ResultCard result={result} onListenAgain={listenFromAnywhere} /> : <p className="muted">That result is no longer saved.</p>}
        </div>
      );
    }
    case 'shared': {
      const result = decodeShared(route.data);
      return (
        <div className="page narrow">
          {result ? (
            <ResultCard result={result} shared onListenAgain={listenFromAnywhere} />
          ) : (
            <p className="muted">This link doesn’t look right. Ask for it to be shared again.</p>
          )}
        </div>
      );
    }
    default:
      return <ListenPage />;
  }
}
