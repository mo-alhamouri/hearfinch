import { CheckItem } from '../components/ui';

export function AboutPage() {
  return (
    <div className="page narrow prose">
      <h1 className="display">About Hearfinch</h1>
      <p className="lead">Hear something and wonder what it is? Hearfinch tells you, whether it’s a song, a movie, a TV show, a podcast or an ad.</p>

      <h2>How it works</h2>
      <ol className="how">
        <li>
          <strong>Songs and ads</strong> are matched by their audio fingerprint, the same way music-recognition apps work.
        </li>
        <li>
          <strong>Movies and shows</strong> are matched by what’s being said: the dialogue is compared against an index of subtitles.
        </li>
        <li>
          <strong>Anything else</strong> gets a clearly labelled best guess, like “live basketball broadcast”.
        </li>
      </ol>
      <p>Hearfinch tells you what a title is, who’s in it and where to watch or listen. It doesn’t tell you which scene or episode you heard.</p>

      <h2>Your privacy</h2>
      <ul className="check-list">
        <CheckItem>The microphone is only used after you press Listen, for the length you set.</CheckItem>
        <CheckItem>The clip is sent to identify it and isn’t stored.</CheckItem>
        <CheckItem>Your history and settings stay in this browser. There are no accounts.</CheckItem>
      </ul>

      <h2>Credits</h2>
      <p className="muted">
        Movie and TV information from{' '}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB. Subtitle data from{' '}
        <a href="https://www.opensubtitles.org/" target="_blank" rel="noopener noreferrer">
          OpenSubtitles
        </a>
        . Song recognition by ACRCloud.
      </p>
    </div>
  );
}
