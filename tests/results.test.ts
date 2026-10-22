import { describe, expect, it } from 'vitest';
import { normalizeSearch } from '../worker/deepseek';
import { validateSources } from '../worker/summary';
import { orderResults } from '../src/lib/results';
import { fixtureResults, sources } from './fixtures';

describe('retrieval size and transparent ranking', () => {
  it('keeps the upstream order, score and authority without inventing confidence', () => {
    const result = normalizeSearch(
      {
        results: [
          { ...fixtureResults[0], rerank_score: 1.2, authority: 0 },
          { ...fixtureResults[1], rerank_score: 2.9, authority: 4 },
        ],
      },
      50,
    );
    expect(result).toMatchObject({ requestedCount: 50, receivedCount: 2, discardedCount: 0 });
    expect(result.results.map((item) => item.relevanceScore)).toEqual([1.2, 2.9]);
    expect(result.results.map((item) => item.authority)).toEqual([0, 4]);
    expect(result.results.map((item) => item.url)).toEqual(fixtureResults.map((item) => item.url));
  });
  it('distinguishes fewer returned results from duplicates and invalid entries', () => {
    const result = normalizeSearch(
      {
        results: [
          ...fixtureResults,
          fixtureResults[0],
          { ...fixtureResults[0], url: 'javascript:alert(1)' },
        ],
      },
      50,
    );
    expect(result).toMatchObject({ requestedCount: 50, receivedCount: 4, discardedCount: 2 });
    expect(result.results).toHaveLength(2);
  });
  it.each([
    [undefined, undefined],
    [NaN, -1],
    [Infinity, 10],
    [-1, 1.5],
    ['2.7', '3'],
    [3.1, null],
  ])('ignores missing or invalid signals %j %j', (rerank_score, authority) => {
    const result = normalizeSearch(
      { results: [{ ...fixtureResults[0], rerank_score, authority }] },
      50,
    );
    expect(result.results[0]).toMatchObject({ relevanceScore: null, authority: null });
  });
  it('retains 50 unique results and permits their stable IDs as summary sources', () => {
    const result = normalizeSearch(
      {
        results: Array.from({ length: 50 }, (_, index) => ({
          ...fixtureResults[0],
          url: `https://example.org/${index}`,
        })),
      },
      50,
    );
    expect(result.results).toHaveLength(50);
    expect(result.results[49].id).toBe(50);
    expect(validateSources([{ ...sources[0], id: 50 }])[0].id).toBe(50);
    expect(() => validateSources([{ ...sources[0], id: 51 }])).toThrow('INVALID_INPUT');
  });
  it('local sorts leave IDs and the original snapshot unchanged; unknown values sort last', () => {
    const { results } = normalizeSearch(
      {
        results: [
          { ...fixtureResults[0], rerank_score: 1, authority: 0, date: '2026-01-01T00:00:00Z' },
          { ...fixtureResults[1], rerank_score: 2.5, authority: 4, date: '2026-09-01T00:00:00Z' },
          { ...fixtureResults[0], url: 'https://example.org/unknown', date: null },
        ],
      },
      50,
    );
    for (const order of ['score', 'authority', 'date'] as const)
      expect(orderResults(results, order).map((item) => item.id)).toEqual([2, 1, 3]);
    expect(results.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(orderResults(results, 'default')).toEqual(results);
  });
});
