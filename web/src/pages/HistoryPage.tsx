import { useRef } from 'react';

import { Icon } from '../components/Icon';
import { KIND, KindTile } from '../components/ui';
import { href } from '../lib/router';
import { formatWhen } from '../lib/share';
import { clearHistory, useHistory, useSettings } from '../lib/storage';
import { listenFromAnywhere } from './ListenPage';

export function HistoryPage() {
  const history = useHistory();
  const { saveHistory } = useSettings();
  const dialog = useRef<HTMLDialogElement>(null);
  const n = history.length;

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1 className="display">History</h1>
          <p className="muted">{n === 1 ? '1 thing identified' : `${n} things identified`} · saved in this browser only</p>
        </div>
        {n > 0 && (
          <button className="btn btn-secondary" onClick={() => dialog.current?.showModal()}>
            Clear history
          </button>
        )}
      </header>

      {!saveHistory && (
        <p className="note">
          Saving history is off, so new finds won’t show up here. You can turn it back on in <a href={href('settings')}>Settings</a>.
        </p>
      )}

      {n === 0 ? (
        <div className="message">
          <span className="message-icon">
            <Icon name="clock" size={36} />
          </span>
          <h2>Nothing here yet</h2>
          <p className="muted">Everything you identify will show up here so you can find it again.</p>
          <button className="btn btn-primary" onClick={listenFromAnywhere}>
            Start listening
          </button>
        </div>
      ) : (
        <ul className="rows">
          {history.map((h) => (
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

      <dialog ref={dialog} className="dialog" aria-labelledby="clear-title">
        <form method="dialog">
          <h2 id="clear-title">Clear your history?</h2>
          <p className="muted">
            This removes all {n} things you’ve identified from this browser. You can’t undo this.
          </p>
          <div className="dialog-actions">
            <button className="btn btn-secondary" value="cancel" autoFocus>
              Cancel
            </button>
            <button className="btn btn-danger" value="clear" onClick={() => clearHistory()}>
              Clear
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
