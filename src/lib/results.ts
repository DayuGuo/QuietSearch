import type { SearchResult } from '../../shared/contracts';

export type ResultOrder = 'default' | 'score' | 'authority' | 'date';

// IDs belong to sources, not display positions. Never mutate or renumber the
// search snapshot when changing the local presentation of its results.
export function orderResults(results: SearchResult[], order: ResultOrder): SearchResult[] {
  const copy = [...results];
  if (order === 'default') return copy;
  const value = (result: SearchResult) => {
    if (order === 'score') return result.relevanceScore ?? -Infinity;
    if (order === 'authority') return result.authority ?? -Infinity;
    const timestamp = result.date ? Date.parse(result.date) : NaN;
    return Number.isFinite(timestamp) ? timestamp : -Infinity;
  };
  return copy.sort((a, b) => value(b) - value(a) || a.id - b.id);
}
