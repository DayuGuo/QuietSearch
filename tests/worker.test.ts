import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorker } from '../worker/index';
import { ENDPOINTS, normalizeSearch } from '../worker/deepseek';
import { type Env } from '../worker/security';
import { fixtureResults, sources, upstreamStream } from './fixtures';

const dummyKey = 'sk-invalid-synthetic-test-key';
const makeEnv = (values: Partial<Env> = {}): Env => ({
  KEY_MODE: 'byok',
  ASSETS: {
    fetch: async () =>
      new Response('<html>test</html>', { headers: { 'Content-Type': 'text/html' } }),
  },
  API_LIMITER: { limit: async () => ({ success: true }) },
  ...values,
});
function request(path: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request(`https://test.local${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://test.local',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dummyKey}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const upstream = vi.fn<typeof fetch>(async (input) =>
  String(input) === ENDPOINTS.search
    ? Response.json({ results: fixtureResults })
    : String(input) === ENDPOINTS.models
      ? Response.json({ data: [{ id: 'deepseek-flash' }] })
      : new Response(upstreamStream(), { headers: { 'Content-Type': 'text/event-stream' } }),
);
const worker = createWorker(upstream);
beforeEach(() => {
  upstream.mockClear();
});

describe('Worker API and upstream boundaries', () => {
  it('returns public config without secrets and secures static HTML', async () => {
    const env = makeEnv({ DEEPSEEK_API_KEY: 'never-return-me' });
    const response = await worker.fetch(new Request('https://test.local/api/config'), env);
    expect(await response.json()).toEqual({ keyMode: 'byok', maxQueryLength: 128 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const html = await worker.fetch(new Request('https://test.local/'), env);
    expect(html.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
    expect(html.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(upstream).not.toHaveBeenCalled();
  });
  it('ordinary search calls Search once and Chat zero times', async () => {
    const response = await worker.fetch(
      request('/api/search', { rawQuery: 'simple search', count: 10 }),
      makeEnv(),
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe(ENDPOINTS.search);
    const options = upstream.mock.calls[0][1]!;
    expect(JSON.parse(String(options.body))).toEqual({
      query: 'simple search',
      count: 10,
      need_content: false,
    });
    expect(options.redirect).toBe('manual');
    expect(options.headers).not.toHaveProperty('Cookie');
    expect(((await response.json()) as { mode: string }).mode).toBe('search');
  });
  it('question search then summary calls each fixed endpoint once', async () => {
    const search = await worker.fetch(
      request('/api/search', { rawQuery: 'a question？', count: 10 }),
      makeEnv(),
    );
    const result = (await search.json()) as { results: typeof sources; submittedQuery: string };
    const response = await worker.fetch(
      request('/api/summary', {
        rawQuery: result.submittedQuery,
        results: result.results.map(({ id, title, url, summary }) => ({ id, title, url, summary })),
      }),
      makeEnv(),
    );
    const body = await response.text();
    expect(upstream.mock.calls.map((call) => call[0])).toEqual([
      ENDPOINTS.search,
      ENDPOINTS.summary,
    ]);
    const sent = JSON.parse(String(upstream.mock.calls[1][1]?.body));
    expect(sent).toMatchObject({
      model: 'deepseek-flash',
      reasoning_effort: 'none',
      max_tokens: 800,
      stream: true,
    });
    expect(sent.tools).toBeUndefined();
    expect(JSON.stringify(sent.messages)).not.toContain(dummyKey);
    expect(body).toContain('event: done');
    expect(body).toContain('promptTokens');
    expect(body).not.toContain('not displayed');
  });
  it('check-key calls only models and never echoes key', async () => {
    const response = await worker.fetch(request('/api/check-key'), makeEnv());
    expect(upstream.mock.calls.map((call) => call[0])).toEqual([ENDPOINTS.models]);
    expect(await response.text()).not.toContain(dummyKey);
  });
  it.each([
    ['/api/summary', { rawQuery: 'no question mark', results: sources }, 'AI_NOT_REQUESTED'],
    ['/api/summary', { rawQuery: 'no question mark', results: sources, ai: true }, 'INVALID_INPUT'],
    ['/api/summary', { rawQuery: 'question?', results: [] }, 'NO_SOURCES'],
    ['/api/summary', { rawQuery: 'question?', results: sources, model: 'other' }, 'INVALID_INPUT'],
    [
      '/api/summary',
      { rawQuery: 'question?', results: [{ ...sources[0], url: 'javascript:alert(1)' }] },
      'INVALID_INPUT',
    ],
    ['/api/search', { rawQuery: '？？', count: 10 }, 'EMPTY_QUERY'],
    ['/api/search', { rawQuery: 'x'.repeat(129), count: 10 }, 'QUERY_TOO_LONG'],
    ['/api/search', { rawQuery: 'valid', count: 51 }, 'INVALID_INPUT'],
    ['/api/search', { rawQuery: 'valid', count: '10' }, 'INVALID_INPUT'],
    [
      '/api/search',
      { rawQuery: 'valid', count: 10, baseURL: 'https://evil.test' },
      'INVALID_INPUT',
    ],
  ])('rejects invalid input before upstream: %s %j', async (path, body, code) => {
    const response = await worker.fetch(request(path, body), makeEnv());
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).toContain(code);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('limits streamed request bytes without Content-Length', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(' '.repeat(3000)));
        controller.close();
      },
    });
    const req = new Request('https://test.local/api/search', {
      method: 'POST',
      headers: { Origin: 'https://test.local', 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect((await worker.fetch(req, makeEnv())).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('BYOK never falls back to a configured server secret', async () => {
    const response = await worker.fetch(
      request('/api/search', { rawQuery: 'valid', count: 10 }, { Authorization: '' }),
      makeEnv({ DEEPSEEK_API_KEY: 'server-key' }),
    );
    expect(await response.text()).toContain('MISSING_KEY');
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([{}, { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'audience' }])(
    'server mode fails closed without valid Access: %j',
    async (config) => {
      const response = await worker.fetch(
        request('/api/search', { rawQuery: 'valid', count: 10 }),
        makeEnv({ KEY_MODE: 'server', DEEPSEEK_API_KEY: 'server-key', ...config }),
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('server mode uses Secret only after verified identity', async () => {
    const authenticate = vi.fn(async () => 'verified-user');
    const response = await createWorker(upstream, authenticate).fetch(
      request('/api/search', { rawQuery: 'valid', count: 10 }),
      makeEnv({ KEY_MODE: 'server', DEEPSEEK_API_KEY: 'server-secret' }),
    );
    expect(response.status).toBe(200);
    expect(authenticate).toHaveBeenCalledOnce();
    expect((upstream.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer server-secret',
    );
  });
  it('rate limits before calling upstream and requires binding', async () => {
    expect(
      (
        await worker.fetch(
          request('/api/check-key'),
          makeEnv({ API_LIMITER: { limit: async () => ({ success: false }) } }),
        )
      ).status,
    ).toBe(429);
    expect(
      (await worker.fetch(request('/api/check-key'), makeEnv({ API_LIMITER: undefined }))).status,
    ).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('rejects foreign origins and unknown API routes', async () => {
    expect(
      (
        await worker.fetch(
          request('/api/check-key', {}, { Origin: 'https://evil.test' }),
          makeEnv(),
        )
      ).status,
    ).toBe(403);
    expect(
      (await worker.fetch(new Request('https://test.local/api/unknown'), makeEnv())).status,
    ).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([401, 402, 429, 500, 302])('sanitizes upstream error %s', async (status) => {
    upstream.mockResolvedValueOnce(new Response('private raw error containing key', { status }));
    const response = await worker.fetch(request('/api/check-key'), makeEnv());
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('private raw error');
  });
  it('normalizes safe URLs and stable numbering without remote assets', () => {
    const { results } = normalizeSearch(
      {
        results: [
          ...fixtureResults,
          { ...fixtureResults[0], url: `${fixtureResults[0].url}#fragment` },
          { ...fixtureResults[0], url: 'javascript:alert(1)' },
          { ...fixtureResults[0], url: 'https://user:password@example.com/' },
        ],
      },
      20,
    );
    expect(results).toHaveLength(2);
    expect(results.map((item) => item.id)).toEqual([1, 2]);
    expect(results[0]).not.toHaveProperty('site_icon');
  });
  it.each(['/api/check-key', '/api/search', '/api/summary'])(
    'protects every server-key route: %s',
    async (path) => {
      const body =
        path === '/api/check-key'
          ? {}
          : path === '/api/search'
            ? { rawQuery: 'valid', count: 10 }
            : { rawQuery: 'valid?', results: sources };
      const response = await worker.fetch(
        request(path, body),
        makeEnv({
          KEY_MODE: 'server',
          DEEPSEEK_API_KEY: 'server-secret',
          CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          CF_ACCESS_AUD: 'audience',
        }),
      );
      expect(response.status).toBe(401);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('times out a request body which never finishes', async () => {
    const timeout = new AbortController();
    let cancelled = false;
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timeout.signal);
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request('https://test.local/api/search', {
      method: 'POST',
      headers: { Origin: 'https://test.local', 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    const pending = worker.fetch(req, makeEnv());
    timeout.abort(new DOMException('deadline', 'TimeoutError'));
    expect((await pending).status).toBe(504);
    expect(cancelled).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('propagates caller cancellation to upstream without retrying', async () => {
    const abort = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          started();
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    const original = request('/api/search', { rawQuery: 'valid', count: 10 });
    const pending = createWorker(fetcher).fetch(
      new Request(original, { signal: abort.signal }),
      makeEnv(),
    );
    await ready;
    abort.abort();
    expect((await pending).status).toBe(504);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('bounds and sanitizes oversized or malformed upstream responses', async () => {
    upstream.mockResolvedValueOnce(new Response('x'.repeat(1_048_577)));
    expect((await worker.fetch(request('/api/check-key'), makeEnv())).status).toBe(502);
    upstream.mockResolvedValueOnce(Response.json(null));
    expect(
      (await worker.fetch(request('/api/search', { rawQuery: 'valid', count: 10 }), makeEnv()))
        .status,
    ).toBe(502);
  });
});
