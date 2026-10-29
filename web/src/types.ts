// Keep in sync with worker/src/types.ts (the parts after IdentifyResponse are Worker-only).

export type Kind = 'song' | 'movie' | 'series' | 'podcast' | 'ad' | 'guess';
export type MatchMethod = 'audio_fingerprint' | 'dialogue_match' | 'transcript_match' | 'ad_fingerprint' | 'ai_guess';

export interface IdentifyResult {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  about: string;
  confidence: number;
  method: MatchMethod;
  artworkUrl?: string;
  details: { label: string; value: string }[];
  links: { label: string; url: string }[];
  heardText?: string;
  note?: string;
}

export type IdentifyResponse = { status: 'match'; result: IdentifyResult } | { status: 'no_match' };

export interface HistoryEntry {
  result: IdentifyResult;
  /** ISO timestamp */
  identifiedAt: string;
}

export type ClipLength = 5 | 10 | 15;

export interface Settings {
  clipLength: ClipLength;
  /** ISO 3166 country code used for "where to watch" links. */
  region: string;
  saveHistory: boolean;
}
