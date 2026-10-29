import { REGIONS, updateSettings, useSettings } from '../lib/storage';
import type { ClipLength } from '../types';

const LENGTHS: ClipLength[] = [5, 10, 15];

export function SettingsPage() {
  const s = useSettings();

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1 className="display">Settings</h1>
      </header>

      <section className="group" aria-labelledby="listening-h">
        <h2 id="listening-h" className="eyebrow">
          Listening
        </h2>
        <fieldset className="field">
          <legend>Listen for</legend>
          <div className="segmented">
            {LENGTHS.map((n) => (
              <label key={n} className={s.clipLength === n ? 'on' : ''}>
                <input type="radio" name="clip" value={n} checked={s.clipLength === n} onChange={() => updateSettings({ clipLength: n })} />
                {n} sec
              </label>
            ))}
          </div>
          <p className="muted small">Longer clips work better for quiet or talk-heavy audio, like a scene from a show.</p>
        </fieldset>
        <label className="switch-row">
          <span>
            <span className="label">Show what Hearfinch heard</span>
            <span className="muted small">For testing: after each search, show the words it heard and the closest titles.</span>
          </span>
          <input type="checkbox" role="switch" checked={s.showDetails} onChange={(e) => updateSettings({ showDetails: e.target.checked })} />
        </label>
      </section>

      <section className="group" aria-labelledby="results-h">
        <h2 id="results-h" className="eyebrow">
          Results
        </h2>
        <div className="field">
          <label htmlFor="region">Where-to-watch region</label>
          <select id="region" value={s.region} onChange={(e) => updateSettings({ region: e.target.value })}>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="muted small">Used to show which streaming services carry a movie or show where you are.</p>
        </div>
      </section>

      <section className="group" aria-labelledby="privacy-h">
        <h2 id="privacy-h" className="eyebrow">
          Privacy
        </h2>
        <label className="switch-row">
          <span>
            <span className="label">Save my history</span>
            <span className="muted small">Keep a list of what you identify, in this browser only.</span>
          </span>
          <input type="checkbox" role="switch" checked={s.saveHistory} onChange={(e) => updateSettings({ saveHistory: e.target.checked })} />
        </label>
        <p className="muted small">
          Microphone access is managed by your browser. To turn it off, use the site settings next to the address bar.
        </p>
      </section>
    </div>
  );
}
