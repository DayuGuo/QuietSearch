export const LIMITS = {
  query: 128,
  searchResults: 50,
  searchBody: 2048,
  summaryBody: 65_536,
  upstreamBody: 1_048_576,
  sources: 6,
  sourceSummary: 1200,
  title: 300,
  url: 2048,
  outputTokens: 800,
  outputCharacters: 12_000,
  bodyTimeout: 10_000,
  searchTimeout: 20_000,
  summaryTimeout: 60_000,
} as const;

export type Mode = 'search' | 'answer';
export type Query = { submittedQuery: string; query: string; mode: Mode };
export type SearchResult = {
  id: number;
  title: string;
  url: string;
  siteName: string;
  snippet: string;
  summary: string;
  date: string | null;
  relevanceScore?: number | null;
  authority?: number | null;
};
export type SearchResponse = Query & {
  results: SearchResult[];
  requestId: string;
  requestedCount?: number;
  receivedCount?: number;
  discardedCount?: number;
};
export type Source = Pick<SearchResult, 'id' | 'title' | 'url' | 'summary'>;
export type PublicConfig = { keyMode: 'byok' | 'server'; maxQueryLength: number };
export type Usage = { promptTokens: number; completionTokens: number };
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'EMPTY_QUERY'
  | 'QUERY_TOO_LONG'
  | 'BODY_TOO_LARGE'
  | 'AI_NOT_REQUESTED'
  | 'NO_SOURCES'
  | 'MISSING_KEY'
  | 'INVALID_KEY'
  | 'AUTH_REQUIRED'
  | 'CONFIG_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'STREAM_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status = 400,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > LIMITS.url) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('INVALID_INPUT');
  return value as Record<string, unknown>;
}

export function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new AppError('INVALID_INPUT');
}

export function text(value: unknown, max: number): string {
  return typeof value === 'string' ? Array.from(value).slice(0, max).join('').trim() : '';
}

export function summarySources(results: SearchResult[]): Source[] {
  return results
    .filter((result) => result.summary.trim())
    .slice(0, LIMITS.sources)
    .map(({ id, title, url, summary }) => ({
      id,
      title,
      url,
      summary: text(summary, LIMITS.sourceSummary),
    }));
}
