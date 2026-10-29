import { useState } from 'react';

import { shareResult } from '../lib/share';
import type { IdentifyResult } from '../types';
import { Icon } from './Icon';
import { KIND, METHOD } from './ui';

/**
 * One identified title. Shows information about the title itself — never the
 * exact scene, episode or timestamp.
 */
export function ResultCard({ result, shared = false, onListenAgain }: { result: IdentifyResult; shared?: boolean; onListenAgain?: () => void }) {
  const [shareMsg, setShareMsg] = useState('');
  const pct = Math.round(result.confidence * 100);
  const guess = result.kind === 'guess';

  const share = async () => {
    try {
      const how = await shareResult(result);
      if (how === 'copied') setShareMsg('Link copied');
      if (how === 'shared') setShareMsg('Shared');
    } catch {
      setShareMsg('Couldn’t share this one');
    }
    setTimeout(() => setShareMsg(''), 2500);
  };

  return (
    <article className="result" aria-labelledby="result-title">
      <div className={`art kind-${result.kind}`}>
        {result.artworkUrl ? (
          <img src={result.artworkUrl} alt="" loading="lazy" />
        ) : (
          <Icon name={result.kind} size={84} />
        )}
        <span className="badge">
          <Icon name={result.kind} size={14} />
          {KIND[result.kind].label}
        </span>
      </div>

      <div className="result-body">
        <p className="eyebrow">{shared ? 'Shared with you' : guess ? 'Best guess' : 'Identified'}</p>
        <h2 id="result-title" className="result-title">
          {result.title}
        </h2>
        <p className="muted">{result.subtitle}</p>

        {result.note && <p className="note">{result.note}</p>}

        {!shared && (
          <div className="card">
            <div className="match-row">
              <strong className="match">{pct}% match</strong>
              <span className="muted small">via {METHOD[result.method]}</span>
            </div>
            <div className="bar" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Match confidence">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <section className="card outlined" aria-label="About">
          <p className="eyebrow">About</p>
          <p>{result.about}</p>
        </section>

        {result.heardText && (
          <section className="card outlined" aria-label="What we heard">
            <p className="eyebrow">What we heard</p>
            <p>
              <em>{result.heardText}</em>
            </p>
          </section>
        )}

        {result.links.length > 0 && (
          <div className="actions">
            {result.links.map((l, i) => (
              <a key={l.url} className={`btn ${i === 0 ? 'btn-primary' : 'btn-secondary'}`} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        )}

        {result.details.length > 0 && (
          <dl className="details">
            {result.details.map((d) => (
              <div key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="result-footer">
          {!shared && (
            <button className="btn btn-secondary btn-icon" onClick={share}>
              <Icon name="share" size={18} />
              Share
            </button>
          )}
          {onListenAgain && (
            <button className="btn btn-ghost" onClick={onListenAgain}>
              {shared ? 'Identify something yourself' : 'Not right? Listen again'}
            </button>
          )}
          <span className="sr-only" role="status">
            {shareMsg}
          </span>
          {shareMsg && (
            <span className="toast-inline" aria-hidden="true">
              {shareMsg}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
