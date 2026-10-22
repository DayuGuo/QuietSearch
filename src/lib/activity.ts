import { useSyncExternalStore } from 'react';
import { LIMITS, type Mode, type Usage } from '../../shared/contracts';

export type Preferences = {
  theme: 'system' | 'light' | 'dark';
  language: 'zh' | 'en';
  count: 10 | 20;
  historyEnabled: boolean;
};
export type HistoryEntry = {
  id: string;
  query: string;
  mode: Mode;
  at: string;
  day: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  resultCount: number;
};
export type DailyUsage = {
  day: string;
  searches: number;
  successes: number;
  results: number;
  aiRequests: number;
  promptTokens: number;
  completionTokens: number;
};
type Activity = { history: HistoryEntry[]; days: DailyUsage[] };
const PREF_KEY = 'quietsearch.preferences.v1',
  ACTIVITY_KEY = 'quietsearch.activity.v1';
export const defaults: Preferences = {
  theme: 'system',
  language: 'zh',
  count: 10,
  historyEnabled: true,
};
const listeners = new Set<() => void>();

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function read(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value && value.length < 1_000_000 ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
function preferences(value: unknown): Preferences {
  const data = asObject(value);
  return {
    theme: ['system', 'light', 'dark'].includes(String(data.theme))
      ? (data.theme as Preferences['theme'])
      : 'system',
    language: data.language === 'en' ? 'en' : 'zh',
    count: data.count === 20 ? 20 : 10,
    historyEnabled: data.historyEnabled !== false,
  };
}
const integer = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 1e12 ? Number(value) : 0;

export function sanitizeActivity(value: unknown, now = new Date()): Activity {
  const data = asObject(value),
    cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const dayCutoff = new Date(now);
  dayCutoff.setDate(dayCutoff.getDate() - 89);
  const history = (Array.isArray(data.history) ? data.history : [])
    .slice(0, 200)
    .flatMap((item) => {
      const row = asObject(item);
      if (
        typeof row.query !== 'string' ||
        new TextEncoder().encode(row.query).length > LIMITS.searchBody ||
        typeof row.at !== 'string' ||
        !Number.isFinite(Date.parse(row.at)) ||
        Date.parse(row.at) < cutoff.getTime() ||
        Date.parse(row.at) > now.getTime() + 60_000 ||
        typeof row.id !== 'string' ||
        row.id.length > 64
      )
        return [];
      return [
        {
          id: row.id,
          query: row.query,
          mode: row.mode === 'answer' ? ('answer' as const) : ('search' as const),
          at: row.at,
          day: localDay(new Date(row.at)),
          status: ['success', 'failed', 'cancelled'].includes(String(row.status))
            ? (row.status as HistoryEntry['status'])
            : ('cancelled' as const),
          resultCount: Math.min(LIMITS.searchResults, integer(row.resultCount)),
        },
      ];
    });
  const days = (Array.isArray(data.days) ? data.days : []).slice(-90).flatMap((item) => {
    const row = asObject(item);
    if (
      typeof row.day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.day) ||
      row.day < localDay(dayCutoff) ||
      row.day > localDay(now)
    )
      return [];
    return [
      {
        day: row.day,
        searches: integer(row.searches),
        successes: integer(row.successes),
        results: integer(row.results),
        aiRequests: integer(row.aiRequests),
        promptTokens: integer(row.promptTokens),
        completionTokens: integer(row.completionTokens),
      },
    ];
  });
  return { history, days };
}

let snapshot = {
  preferences: preferences(read(PREF_KEY)),
  ...sanitizeActivity(read(ACTIVITY_KEY)),
  storageAvailable: true,
};
function emit() {
  listeners.forEach((listener) => listener());
}
function persist() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(snapshot.preferences));
    localStorage.setItem(
      ACTIVITY_KEY,
      JSON.stringify({ history: snapshot.history, days: snapshot.days }),
    );
    snapshot = { ...snapshot, storageAvailable: true };
  } catch {
    snapshot = { ...snapshot, storageAvailable: false };
  }
  emit();
}
function updateDay(day: string, change: (usage: DailyUsage) => DailyUsage) {
  const existing = snapshot.days.find((item) => item.day === day) ?? {
    day,
    searches: 0,
    successes: 0,
    results: 0,
    aiRequests: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
  snapshot = {
    ...snapshot,
    days: [...snapshot.days.filter((item) => item.day !== day), change(existing)]
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-90),
  };
}

export const activity = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  setPreferences(change: Partial<Preferences>) {
    snapshot = { ...snapshot, preferences: preferences({ ...snapshot.preferences, ...change }) };
    persist();
  },
  start(query: string, mode: Mode) {
    const id = crypto.randomUUID(),
      day = localDay(),
      at = new Date().toISOString();
    updateDay(day, (item) => ({ ...item, searches: item.searches + 1 }));
    if (snapshot.preferences.historyEnabled)
      snapshot = {
        ...snapshot,
        history: [
          { id, query, mode, at, day, status: 'pending' as const, resultCount: 0 },
          ...snapshot.history,
        ]
          .filter((item) => Date.parse(item.at) > Date.now() - 30 * 86400_000)
          .slice(0, 200),
      };
    persist();
    return { id, day };
  },
  finish(id: string, day: string, status: HistoryEntry['status'], resultCount = 0) {
    snapshot = {
      ...snapshot,
      history: snapshot.history.map((item) =>
        item.id === id ? { ...item, status, resultCount } : item,
      ),
    };
    if (status === 'success')
      updateDay(day, (item) => ({
        ...item,
        successes: item.successes + 1,
        results: item.results + resultCount,
      }));
    persist();
  },
  aiStart(day: string) {
    updateDay(day, (item) => ({ ...item, aiRequests: item.aiRequests + 1 }));
    persist();
  },
  aiUsage(day: string, usage?: Usage) {
    if (usage) {
      updateDay(day, (item) => ({
        ...item,
        promptTokens: item.promptTokens + usage.promptTokens,
        completionTokens: item.completionTokens + usage.completionTokens,
      }));
      persist();
    }
  },
  remove(id: string) {
    snapshot = { ...snapshot, history: snapshot.history.filter((item) => item.id !== id) };
    persist();
  },
  clearHistory() {
    snapshot = { ...snapshot, history: [] };
    persist();
  },
  clearUsage() {
    snapshot = { ...snapshot, days: [] };
    persist();
  },
  clearAll() {
    snapshot = { preferences: { ...defaults }, history: [], days: [], storageAvailable: true };
    persist();
  },
};

if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === PREF_KEY || event.key === ACTIVITY_KEY || event.key === null) {
      snapshot = {
        ...snapshot,
        preferences: preferences(read(PREF_KEY)),
        ...sanitizeActivity(read(ACTIVITY_KEY)),
      };
      emit();
    }
  });
// Purge expired entries and unknown fields when the app opens, not just after
// the next search. This cannot run while the application is closed.
if (typeof window !== 'undefined') persist();
export function useActivity() {
  return useSyncExternalStore(activity.subscribe, activity.getSnapshot);
}
