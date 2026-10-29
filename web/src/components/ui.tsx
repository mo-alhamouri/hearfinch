import type { Kind } from '../types';
import { Icon } from './Icon';

export const KIND = {
  song: { label: 'Song', plural: 'Songs' },
  movie: { label: 'Movie', plural: 'Movies' },
  series: { label: 'Series', plural: 'Shows' },
  podcast: { label: 'Podcast', plural: 'Podcasts' },
  ad: { label: 'Commercial', plural: 'Ads' },
  guess: { label: 'Best guess', plural: 'Best guesses' },
} satisfies Record<Kind, { label: string; plural: string }>;

export const METHOD: Record<string, string> = {
  audio_fingerprint: 'audio fingerprint',
  dialogue_match: 'dialogue match',
  transcript_match: 'transcript match',
  ad_fingerprint: 'ad fingerprint',
  ai_guess: 'AI best guess',
};

export function Wordmark() {
  return (
    <span className="wordmark">
      <Icon name="logo" size={28} />
      <span>hearfinch</span>
    </span>
  );
}

export function KindTile({ kind, size = 48 }: { kind: Kind; size?: number }) {
  return (
    <span className={`kind-tile kind-${kind}`} style={{ width: size, height: size, borderRadius: size * 0.29 }}>
      <Icon name={kind} size={Math.round(size * 0.46)} />
    </span>
  );
}

export function KindChip({ kind }: { kind: Kind }) {
  return (
    <span className="chip">
      <span className={`chip-icon kind-text-${kind}`}>
        <Icon name={kind} size={16} />
      </span>
      {KIND[kind].plural}
    </span>
  );
}

export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="check-item">
      <span className="check-dot">
        <Icon name="check" size={14} />
      </span>
      <span>{children}</span>
    </li>
  );
}
