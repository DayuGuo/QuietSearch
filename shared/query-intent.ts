import { AppError, LIMITS, type Query } from './contracts';

export function parseSearchInput(raw: unknown): Query {
  if (typeof raw !== 'string') throw new AppError('INVALID_INPUT');
  const submittedQuery = raw.trim();
  const mode = /[?？]$/u.test(submittedQuery) ? 'answer' : 'search';
  const query =
    mode === 'answer' ? submittedQuery.replace(/[?？]+$/u, '').trimEnd() : submittedQuery;
  if (!/[^\s?？]/u.test(query)) throw new AppError('EMPTY_QUERY');
  if (Array.from(query).length > LIMITS.query) throw new AppError('QUERY_TOO_LONG');
  if (
    new TextEncoder().encode(JSON.stringify({ rawQuery: raw, count: 20 })).length >
    LIMITS.searchBody
  )
    throw new AppError('BODY_TOO_LARGE', 413);
  return { submittedQuery, query, mode };
}
