import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '../components/Icon';
import { ResultCard } from '../components/ResultCard';
import { CheckItem, KIND, KindChip, KindTile } from '../components/ui';
import { identify, IdentifyError } from '../lib/identify';
import { recordClip, RecorderError, type RecorderErrorKind } from '../lib/recorder';
import { href } from '../lib/router';
import { formatWhen } from '../lib/share';
import { addToHistory, useHistory, useSettings } from '../lib/storage';
import type { DebugInfo, IdentifyResult } from '../types';

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'identifying'; step: 1 | 2 }
  | { kind: 'result'; result: IdentifyResult; debug?: DebugInfo }
  | { kind: 'nomatch'; debug?: DebugInfo }
  | { kind: 'mic-error'; reason: RecorderErrorKind }
  | { kind: 'error'; message: string };

/** Set by other pages ("Listen again") so the next visit here starts right away. */
let startOnArrival = false;
export function listenFromAnywhere() {
  startOnArrival = true;
  location.hash = '/';
}

const MIC_ERRORS: Record<RecorderErrorKind, { title: string; body: string }> = {
  denied: {
    title: 'Hearfinch can’t hear anything yet',
    body: 'Allow microphone access for this site (usually the icon at the left of the address bar), then try again. Nothing is recorded until you press Listen.',
  },
  'no-device': { title: 'No microphone found', body: 'Plug in or turn on a microphone, then try again.' },
  unsupported: { title: 'This browser can’t record audio', body: 'Try a recent version of Chrome, Safari, Edge or Firefox.' },
  insecure: { title: 'Recording needs a secure page', body: 'Open Hearfinch over https:// to use the microphone.' },
};

export function ListenPage() {
  const settings = useSettings();
  const history = useHistory();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const listen = useCallback(async () => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const { clipLength, region, showDetails } = settings;

    try {
      setPhase({ kind: 'recording' });
      setSecondsLeft(clipLength);
      const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
      let clip: Blob;
      try {
        clip = await recordClip(clipLength, abort.signal);
      } finally {
        clearInterval(tick);
      }

      setPhase({ kind: 'identifying', step: 1 });
      const stepTimer = setTimeout(() => setPhase((p) => (p.kind === 'identifying' ? { kind: 'identifying', step: 2 } : p)), 900);
      const res = await identify(clip, region, abort.signal, showDetails).finally(() => clearTimeout(stepTimer));

      if (res.status === 'match') {
        addToHistory(res.result);
        setPhase({ kind: 'result', result: res.result, debug: res.debug });
      } else {
        setPhase({ kind: 'nomatch', debug: res.debug });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return setPhase({ kind: 'idle' });
      if (e instanceof RecorderError) return setPhase({ kind: 'mic-error', reason: e.kind });
      setPhase({ kind: 'error', message: e instanceof IdentifyError ? e.message : 'Something went wrong. Please try again.' });
    }
  }, [settings]);

  const cancel = () => abortRef.current?.abort();

  useEffect(() => {
    if (startOnArrival) {
      startOnArrival = false;
      listen();
    }
    return () => abortRef.current?.abort();
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bring the answer into view on small screens, and move focus to it.
  useEffect(() => {
    if (['result', 'nomatch', 'mic-error', 'error'].includes(phase.kind)) {
      panelRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 959px)').matches) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [phase.kind]);

  const busy = phase.kind === 'recording' || phase.kind === 'identifying';
  const step = phase.kind === 'recording' ? 0 : phase.kind === 'identifying' ? phase.step : -1;
  const steps = [`Listen for ${settings.clipLength} seconds`, 'Work out what kind of audio it is', 'Look for a match'];
  const headline =
    phase.kind === 'recording' ? `Listening… ${secondsLeft}s` : phase.kind === 'identifying' ? 'Finding a match…' : 'What’s that playing?';

  return (
    <div className="listen-layout">
      <section className="listen-panel" aria-labelledby="listen-heading">
        <h1 id="listen-heading" className="display" aria-live="polite">
          {headline}
        </h1>
        <p className="lead">
          {busy ? 'Keep your device near the sound.' : 'Press listen and Hearfinch will tell you what it is: a song, movie, show, podcast or ad.'}
        </p>

        <div className={`orb-wrap${busy ? ' is-active' : ''}`}>
          {busy && (
            <>
              <span className="ring" />
              <span className="ring ring-2" />
              <span className="ring ring-3" />
            </>
          )}
          <button className="orb" onClick={listen} disabled={busy} aria-label={busy ? 'Listening' : 'Listen and identify what’s playing'}>
            {busy ? (
              <span className="bars" aria-hidden="true">
                <span /> <span /> <span /> <span /> <span />
              </span>
            ) : (
              <Icon name="wave" size={84} />
            )}
          </button>
        </div>

        {busy ? (
          <>
            <ol className="steps">
              {steps.map((label, i) => (
                <li key={label} className={i < step ? 'done' : i === step ? 'active' : ''}>
                  <span className="step-dot">{i < step && <Icon name="check" size={14} />}</span>
                  {label}
                </li>
              ))}
            </ol>
            <button className="btn btn-ghost" onClick={cancel}>
              Cancel
            </button>
          </>
        ) : (
          <div className="chips" aria-label="Hearfinch can identify">
            {(['song', 'movie', 'series', 'podcast', 'ad'] as const).map((k) => (
              <KindChip key={k} kind={k} />
            ))}
          </div>
        )}
      </section>

      <section className="side-panel" ref={panelRef} tabIndex={-1} aria-label="Result">
        {phase.kind === 'result' && <ResultCard result={phase.result} onListenAgain={listen} />}
        {(phase.kind === 'result' || phase.kind === 'nomatch') && phase.debug && <HeardDetails debug={phase.debug} />}

        {phase.kind === 'nomatch' && (
          <div className="message">
            <span className="message-icon dashed">
              <Icon name="guess" size={44} />
            </span>
            <h2>We couldn’t place that one</h2>
            <p className="muted">Hearfinch heard something but couldn’t find a match. These usually help:</p>
            <ul className="check-list">
              <CheckItem>Move closer to the sound</CheckItem>
              <CheckItem>Try a part with talking or singing</CheckItem>
              <CheckItem>Cut down background noise, or listen for longer in Settings</CheckItem>
            </ul>
            <button className="btn btn-primary" onClick={listen}>
              Try again
            </button>
          </div>
        )}

        {phase.kind === 'mic-error' && (
          <div className="message">
            <span className="message-icon dashed">
              <Icon name="micoff" size={44} />
            </span>
            <h2>{MIC_ERRORS[phase.reason].title}</h2>
            <p className="muted">{MIC_ERRORS[phase.reason].body}</p>
            <button className="btn btn-primary" onClick={listen}>
              Try again
            </button>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="message">
            <span className="message-icon dashed">
              <Icon name="info" size={44} />
            </span>
            <h2>That didn’t work</h2>
            <p className="muted">{phase.message}</p>
            <button className="btn btn-primary" onClick={listen}>
              Try again
            </button>
          </div>
        )}

        {(phase.kind === 'idle' || busy) && (
          <div className="recent">
            <h2 className="eyebrow">Recent finds</h2>
            {history.length === 0 ? (
              <div className="privacy-note">
                <Icon name="lock" size={20} />
                <p>
                  Hearfinch only listens after you press the button. The clip is used to find a match and isn’t stored. Your finds are saved in this
                  browser only.
                </p>
              </div>
            ) : (
              <ul className="rows">
                {history.slice(0, 5).map((h) => (
                  <li key={h.result.id}>
                    <a className="row" href={href(`result/${h.result.id}`)}>
                      <KindTile kind={h.result.kind} />
                      <span className="row-text">
                        <span className="row-title">{h.result.title}</span>
                        <span className="muted small">
                          {KIND[h.result.kind].label} · {formatWhen(h.identifiedAt)}
                        </span>
                      </span>
                      <Icon name="chevron" size={18} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Testing aid (Settings → Show what Hearfinch heard). */
function HeardDetails({ debug }: { debug: DebugInfo }) {
  return (
    <section className="card outlined details-panel" aria-label="What Hearfinch heard">
      <p className="eyebrow">What Hearfinch heard</p>
      <p>{debug.transcript ? <em>“{debug.transcript}”</em> : <span className="muted">No words were picked up.</span>}</p>
      {debug.candidates && debug.candidates.length > 0 && (
        <>
          <p className="eyebrow">Closest titles</p>
          <ul className="plain-list">
            {debug.candidates.map((c) => (
              <li key={c.title}>
                {c.title} <span className="muted small">({c.type === 'tv' ? 'show' : 'movie'}) · {Math.round(c.score * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="eyebrow">Steps</p>
      <ul className="plain-list small">
        {debug.steps.map((s, i) => (
          <li key={i}>
            <strong>{s.step}</strong>: <span className="muted">{s.outcome}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
