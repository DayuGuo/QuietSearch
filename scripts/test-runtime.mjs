import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Use the exact runtime installed by the Cloudflare Vite plugin. Unlike a
// fetch spy, its native fetch rejects unsupported RequestInit options.
const cloudflareRequire = createRequire(import.meta.resolve('@cloudflare/vite-plugin'));
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(cloudflareRequire.resolve('miniflare')).href
);
const bundle = await readFile('dist/quietsearch/index.js', 'utf8');
const fakeKey = 'sk-invalid-runtime-test-key';
const fakeKagiKey = 'invalid-kagi-runtime-test-key';
const calls = [];
let mode = 'success';
const fixture = {
  title: 'Synthetic runtime source',
  url: 'https://example.org/runtime-test',
  snippet: 'Only used by isolated runtime tests.',
  summary: 'A synthetic source for the Worker runtime regression test.',
  site_name: 'Example',
  date: null,
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    compatibilityDate: '2026-10-19',
    modules: [
      {
        type: 'ESModule',
        path: 'entry.mjs',
        contents: `
      import { createWorker } from './worker.mjs';
      const app = createWorker();
      export default { fetch(request) { return app.fetch(request, {
        KEY_MODE: 'byok', SUMMARY_MODEL: 'deepseek-flash',
        API_LIMITER: { async limit() { return {success: true}; } },
        ASSETS: { async fetch() { return new Response('test', {status: 404}); } },
      }); } };
    `,
      },
      { type: 'ESModule', path: 'worker.mjs', contents: bundle },
    ],
    outboundService: async (request) => {
      const url = new URL(request.url);
      assert.ok(['https://api.deepseek.com', 'https://kagi.com'].includes(url.origin));
      const kagi = url.origin === 'https://kagi.com';
      assert.equal(request.headers.get('Authorization'), `Bearer ${kagi ? fakeKagiKey : fakeKey}`);
      calls.push(url.pathname);
      if (mode === 'unauthorized') return Response.json({ error: 'synthetic' }, { status: 401 });
      if (mode === 'redirect')
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://redirect.invalid/do-not-visit' },
        });
      if (url.pathname === '/models') return Response.json({ data: [{ id: 'deepseek-flash' }] });
      if (url.pathname === '/api/v1/search') {
        assert.equal(request.method, 'POST');
        assert.deepEqual(await request.json(), {
          query: 'runtime test',
          workflow: 'search',
          limit: 50,
        });
        return Response.json({ data: { search: [fixture] } });
      }
      if (url.pathname === '/v1/tools/search') {
        assert.deepEqual(await request.json(), {
          query: 'runtime test',
          count: 50,
          need_content: false,
        });
        return Response.json({ results: [fixture] });
      }
      if (url.pathname === '/chat/completions') {
        const body = await request.json();
        assert.equal(body.reasoning_effort, 'none');
        assert.equal(body.max_tokens, 800);
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Synthetic answer. [1]' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      throw new Error('Unexpected outbound route');
    },
  }),
);

async function post(path, body = {}) {
  return mf.dispatchFetch(`https://runtime.test/api/${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://runtime.test',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${body.provider === 'kagi' ? fakeKagiKey : fakeKey}`,
    },
    body: JSON.stringify(body),
  });
}

try {
  let response = await post('check-key');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.deepEqual(calls.splice(0), ['/models']);

  mode = 'unauthorized';
  response = await post('check-key');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'INVALID_KEY');
  assert.deepEqual(calls.splice(0), ['/models']);

  mode = 'redirect';
  response = await post('check-key');
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'UPSTREAM_ERROR');
  assert.deepEqual(calls.splice(0), ['/models']);

  mode = 'success';
  response = await post('search', { rawQuery: 'runtime test?', count: 50 });
  assert.equal(response.status, 200);
  const search = await response.json();
  assert.equal(search.mode, 'answer');
  assert.equal(search.requestedCount, 50);
  assert.equal(search.receivedCount, 1);
  assert.equal(search.discardedCount, 0);
  assert.deepEqual(calls.splice(0), ['/v1/tools/search']);

  response = await post('summary', {
    rawQuery: search.submittedQuery,
    results: search.results.map(({ id, title, url, summary }) => ({ id, title, url, summary })),
  });
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.match(stream, /event: delta/);
  assert.match(stream, /event: done/);
  assert.match(stream, /"promptTokens":10/);
  assert.deepEqual(calls.splice(0), ['/chat/completions']);

  response = await post('search', { rawQuery: 'runtime test?', count: 50, provider: 'kagi' });
  assert.equal(response.status, 200);
  const kagiSearch = await response.json();
  assert.equal(kagiSearch.provider, 'kagi');
  assert.equal(kagiSearch.results[0].summary, fixture.snippet);
  assert.deepEqual(calls.splice(0), ['/api/v1/search']);
  response = await post('summary', {
    rawQuery: kagiSearch.submittedQuery,
    results: kagiSearch.results.map(({ id, title, url, summary }) => ({ id, title, url, summary })),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /event: done/);
  assert.deepEqual(calls.splice(0), ['/chat/completions']);
  for (const [failure, status] of [
    ['unauthorized', 401],
    ['redirect', 502],
  ]) {
    mode = failure;
    response = await post('search', { rawQuery: 'runtime test', count: 50, provider: 'kagi' });
    assert.equal(response.status, status);
    assert.deepEqual(calls.splice(0), ['/api/v1/search']);
  }
  console.log(
    'PASS: 9 real workerd regressions (DeepSeek + Kagi, credential separation, blocked redirects, search and summary); all upstream responses are synthetic.',
  );
} finally {
  await mf.dispose();
}
