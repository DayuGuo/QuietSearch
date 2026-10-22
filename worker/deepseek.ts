import { AppError, LIMITS, object, safeUrl, text, type SearchResult } from '../shared/contracts';
import { readBytes, upstreamError } from './security';

export const ENDPOINTS = {
  search: 'https://api.deepseek.com/v1/tools/search',
  summary: 'https://api.deepseek.com/chat/completions',
  models: 'https://api.deepseek.com/models',
} as const;
export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function callUpstream(
  fetcher: Fetcher,
  endpoint: keyof typeof ENDPOINTS,
  key: string,
  signal: AbortSignal,
  body?: unknown,
) {
  const response = await fetcher(ENDPOINTS[endpoint], {
    method: body ? 'POST' : 'GET',
    // workerd supports only follow/manual. Refuse redirects through the status
    // check below, so credentials are never forwarded to a redirected host.
    redirect: 'manual',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: endpoint === 'summary' ? 'text/event-stream' : 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw upstreamError(response.status);
  }
  return response;
}

export async function upstreamJSON(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new AppError('UPSTREAM_ERROR', 502);
  try {
    return JSON.parse(
      new TextDecoder().decode(await readBytes(response.body, LIMITS.upstreamBody, signal)),
    );
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new AppError('UPSTREAM_ERROR', 502);
  }
}

export function normalizeSearch(value: unknown, count: number) {
  let data: Record<string, unknown>;
  try {
    data = object(value);
  } catch {
    throw new AppError('UPSTREAM_ERROR', 502);
  }
  if (!Array.isArray(data.results)) throw new AppError('UPSTREAM_ERROR', 502);
  const results: SearchResult[] = [],
    seen = new Set<string>();
  const candidates = data.results.slice(0, LIMITS.searchResults);
  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const url = safeUrl(source.url),
      title = text(source.title, LIMITS.title);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const snippet = text(source.snippet, LIMITS.sourceSummary);
    results.push({
      id: results.length + 1,
      url,
      title,
      siteName: text(source.site_name, 120) || new URL(url).hostname,
      snippet,
      summary: text(source.summary, LIMITS.sourceSummary) || snippet,
      date:
        typeof source.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}T/.test(source.date) &&
        Number.isFinite(Date.parse(source.date))
          ? new Date(source.date).toISOString()
          : null,
      relevanceScore:
        typeof source.rerank_score === 'number' &&
        Number.isFinite(source.rerank_score) &&
        source.rerank_score >= 0 &&
        source.rerank_score <= 3
          ? source.rerank_score
          : null,
      authority:
        Number.isInteger(source.authority) &&
        Number(source.authority) >= 0 &&
        Number(source.authority) <= 4
          ? Number(source.authority)
          : null,
    });
  }
  return {
    results: results.slice(0, count),
    requestedCount: count,
    receivedCount: candidates.length,
    discardedCount: candidates.length - results.length,
  };
}
