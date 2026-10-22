import { describe, expect, it, vi } from 'vitest';
import { createWorker } from '../worker';
import { KAGI_SEARCH_URL, normalizeKagi } from '../worker/kagi';
import { ENDPOINTS } from '../worker/deepseek';
import type { Env } from '../worker/security';
import { upstreamStream } from './fixtures';

const kagiKey = 'invalid-synthetic-kagi-key';
const deepseekKey = 'sk-invalid-synthetic-summary-key';
const fixture = {
  data: {
    search: [
      {
        url: 'https://example.org/source',
        title: 'Synthetic Kagi result',
        snippet: 'Synthetic Kagi snippet',
        time: '2026-10-22T10:00:00Z',
      },
    ],
  },
};
const env: Env = {
  ASSETS: { fetch: async () => new Response('test') },
  API_LIMITER: { limit: async () => ({ success: true }) },
};
function request(body: unknown, key = kagiKey, path = 'search') {
  return new Request(`https://test.local/api/${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://test.local',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}
const search = { rawQuery: 'synthetic query?', count: 50, provider: 'kagi' };

describe('Kagi integration and credential separation', () => {
  it('uses the documented v1 POST endpoint, only the Kagi key, and no paid extras', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture));
    const response = await createWorker(fetcher).fetch(request(search), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(KAGI_SEARCH_URL);
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      headers: { Authorization: `Bearer ${kagiKey}` },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      query: 'synthetic query',
      workflow: 'search',
      limit: 50,
    });
    expect(Object.keys(options!.headers!)).toEqual(['Authorization', 'Accept', 'Content-Type']);
    expect(await response.json()).toMatchObject({
      provider: 'kagi',
      mode: 'answer',
      results: [
        { id: 1, summary: 'Synthetic Kagi snippet', relevanceScore: null, authority: null },
      ],
    });
  });
  it('passes Kagi sources to DeepSeek for an explicit answer without searching again', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      String(url) === KAGI_SEARCH_URL
        ? Response.json(fixture)
        : new Response(upstreamStream(), { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const worker = createWorker(fetcher);
    const result = (await (await worker.fetch(request(search), env)).json()) as {
      results: unknown[];
    };
    const sources = result.results.map((item) => {
      const { id, title, url, summary } = item as Record<string, unknown>;
      return { id, title, url, summary };
    });
    const answer = await worker.fetch(
      request({ rawQuery: search.rawQuery, results: sources }, deepseekKey, 'summary'),
      env,
    );
    expect(await answer.text()).toContain('event: done');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([KAGI_SEARCH_URL, ENDPOINTS.summary]);
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: `Bearer ${deepseekKey}`,
    });
    expect(String(fetcher.mock.calls[1][1]?.body)).toContain('Synthetic Kagi snippet');
    expect(String(fetcher.mock.calls[1][1]?.body)).not.toContain(kagiKey);
  });
  it.each([null, 'other', 'https://evil.example', {}])(
    'rejects an invalid provider %j before any call',
    async (provider) => {
      const fetcher = vi.fn<typeof fetch>();
      const response = await createWorker(fetcher).fetch(request({ ...search, provider }), env);
      expect(response.status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('never falls back to either server secret in BYOK mode', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await createWorker(fetcher).fetch(request(search, ''), {
      ...env,
      KAGI_API_KEY: 'server-kagi',
      DEEPSEEK_API_KEY: 'server-deepseek',
    });
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires a verified Access identity and uses only the selected server secret', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture));
    const worker = createWorker(
      fetcher,
      vi.fn(async () => 'verified-user'),
    );
    const response = await worker.fetch(request(search), {
      ...env,
      KEY_MODE: 'server',
      KAGI_API_KEY: 'server-kagi',
      DEEPSEEK_API_KEY: 'server-deepseek',
    });
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer server-kagi',
    });
    const missing = await worker.fetch(request(search), {
      ...env,
      KEY_MODE: 'server',
      DEEPSEEK_API_KEY: 'server-deepseek',
    });
    expect(missing.status).toBe(503);
    const denied = await createWorker(fetcher).fetch(request(search), {
      ...env,
      KEY_MODE: 'server',
      KAGI_API_KEY: 'server-kagi',
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('advertises configured engines without exposing either key', async () => {
    const response = await createWorker().fetch(new Request('https://test.local/api/config'), {
      ...env,
      KEY_MODE: 'server',
      KAGI_API_KEY: 'server-kagi',
    });
    expect(await response.json()).toEqual({
      keyMode: 'server',
      maxQueryLength: 128,
      searchProviders: ['kagi'],
      summaryAvailable: false,
    });
  });
  it.each([
    [401, 'INVALID_KEY'],
    [402, 'INSUFFICIENT_BALANCE'],
    [403, 'PROVIDER_FORBIDDEN'],
    [429, 'RATE_LIMITED'],
    [302, 'UPSTREAM_ERROR'],
    [500, 'UPSTREAM_ERROR'],
  ])('sanitizes status %s without retries or fallback', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response('private raw response', {
          status: Number(status),
          headers: { Location: 'https://evil.example' },
        }),
    );
    const response = await createWorker(fetcher).fetch(request(search), env);
    const text = await response.text();
    expect(text).toContain(code);
    expect(text).not.toContain('private raw response');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('cleans unsafe and duplicate results, preserves order, and never invents scores', () => {
    const item = fixture.data.search[0];
    const result = normalizeKagi(
      {
        data: {
          search: [
            item,
            { ...item, url: item.url + '#fragment' },
            { ...item, url: 'javascript:alert(1)' },
            { ...item, url: 'https://user:pass@example.org' },
            { ...item, url: 'https://example.net', time: 'unknown', snippet: undefined },
          ],
          news: [{ url: 'https://example.com/ignored' }],
        },
      },
      50,
    );
    expect(result.results.map(({ id, url }) => ({ id, url }))).toEqual([
      { id: 1, url: item.url },
      { id: 2, url: 'https://example.net/' },
    ]);
    expect(result).toMatchObject({ receivedCount: 5, discardedCount: 3 });
    expect(result.results[1]).toMatchObject({ date: null, summary: '', relevanceScore: null });
  });
  it.each([
    null,
    {},
    { data: null },
    { data: { search: {} } },
    { error: [{ code: '2' }], data: null },
  ])('rejects malformed upstream payload %j', (value) => {
    expect(() => normalizeKagi(value, 50)).toThrow('UPSTREAM_ERROR');
  });
  it('bounds result processing and output size', () => {
    const search = Array.from({ length: 100 }, (_, index) => ({
      url: `https://example.org/${index}`,
      title: 'x'.repeat(400),
      snippet: 'x'.repeat(1400),
    }));
    const result = normalizeKagi({ data: { search } }, 20);
    expect(result.receivedCount).toBe(50);
    expect(result.results).toHaveLength(20);
    expect(result.results[0].title).toHaveLength(300);
    expect(result.results[0].summary).toHaveLength(1200);
  });
});
