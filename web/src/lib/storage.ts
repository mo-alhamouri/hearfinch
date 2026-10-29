import { useSyncExternalStore } from 'react';

import type { HistoryEntry, IdentifyResult, Settings } from '../types';

/**
 * Settings and history live in this browser only (localStorage). Nothing is
 * sent anywhere except the clip itself, and only when the visitor taps Listen.
 */
const KEYS = { settings: 'hearfinch.settings', history: 'hearfinch.history' };
const MAX_HISTORY = 100;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: keep working in memory.
  }
}

function defaultRegion() {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  return REGIONS.some((r) => r.code === region) ? region : 'CA';
}

export const REGIONS = [
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NZ', name: 'New Zealand' },
] as const;

let settings: Settings = { clipLength: 10, region: defaultRegion(), saveHistory: true, ...read<Partial<Settings>>(KEYS.settings, {}) };
let history: HistoryEntry[] = read<HistoryEntry[]>(KEYS.history, []);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Keep tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.settings) settings = read(KEYS.settings, settings);
  if (e.key === KEYS.history) history = read(KEYS.history, history);
  emit();
});

export const useSettings = () => useSyncExternalStore(subscribe, () => settings);
export const useHistory = () => useSyncExternalStore(subscribe, () => history);

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  write(KEYS.settings, settings);
  emit();
}

export function addToHistory(result: IdentifyResult) {
  if (!settings.saveHistory) return;
  history = [{ result, identifiedAt: new Date().toISOString() }, ...history].slice(0, MAX_HISTORY);
  write(KEYS.history, history);
  emit();
}

export function clearHistory() {
  history = [];
  write(KEYS.history, history);
  emit();
}

export const findInHistory = (id: string) => history.find((h) => h.result.id === id)?.result;
export const getSettings = () => settings;
