import { AppError, LIMITS, object, safeUrl, text, type SearchResult } from '../shared/contracts';
import { upstreamJSON, type Fetcher } from './deepseek';
import { upstreamError } from './security';

export const KAGI_SEARCH_URL = 'https://kagi.com/api/v1/search';

// Kagi v1 uses POST + Bearer. Keep this endpoint fixed; never forward cookies,
// visitor IPs, or credentials to a redirect. No extraction or automatic retry.
export async function searchKagi(
  fetcher: Fetcher,
  query: string,
  count: number,
  key: string,
  signal: AbortSignal,
) {
  const response = await fetcher(KAGI_SEARCH_URL, {
    method: 'POST',
    redirect: 'manual',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, workflow: 'search', limit: count }),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 403) throw new AppError('PROVIDER_FORBIDDEN', 403);
    throw upstreamError(response.status);
  }
  return normalizeKagi(await upstreamJSON(response, signal), count);
}

export function normalizeKagi(value: unknown, count: number) {
  let data: Record<string, unknown>;
  try {
    data = object(object(value).data);
  } catch {
    throw new AppError('UPSTREAM_ERROR', 502);
  }
  if (data.search !== undefined && !Array.isArray(data.search))
    throw new AppError('UPSTREAM_ERROR', 502);
  const candidates = (Array.isArray(data.search) ? data.search : []).slice(0, LIMITS.searchResults);
  const results: SearchResult[] = [],
    seen = new Set<string>();
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
      siteName: new URL(url).hostname,
      snippet,
      summary: snippet,
      date:
        typeof source.time === 'string' &&
        /^\d{4}-\d{2}-\d{2}T/.test(source.time) &&
        Number.isFinite(Date.parse(source.time))
          ? new Date(source.time).toISOString()
          : null,
      relevanceScore: null,
      authority: null,
    });
  }
  return {
    results: results.slice(0, count),
    requestedCount: count,
    receivedCount: candidates.length,
    discardedCount: candidates.length - results.length,
  };
}
