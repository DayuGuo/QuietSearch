import { AppError, fields, LIMITS, object, searchProvider } from '../shared/contracts';
import { parseSearchInput } from '../shared/query-intent';
import { keyMode, resolveKey, verifyAccess } from './auth';
import { callUpstream, normalizeSearch, upstreamJSON, type Fetcher } from './deepseek';
import { errorOf, json, readJSON, requestSignal, secureResponse, type Env } from './security';
import { relaySummary, SUMMARY_PROMPT, validateSources } from './summary';
import { searchKagi } from './kagi';

// The factory injects external I/O for tests. Production has no authentication bypass flag.
export function createWorker(
  fetcher: Fetcher = fetch,
  authenticate: typeof verifyAccess = verifyAccess,
) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url),
        requestId = crypto.randomUUID();
      try {
        if (!url.pathname.startsWith('/api/'))
          return secureResponse(await env.ASSETS.fetch(request), false);
        if (url.pathname === '/api/config') {
          if (request.method !== 'GET') throw new AppError('METHOD_NOT_ALLOWED', 405);
          const mode = keyMode(env);
          return json({
            keyMode: mode,
            maxQueryLength: LIMITS.query,
            searchProviders:
              mode === 'byok'
                ? ['deepseek', 'kagi']
                : [
                    ...(env.DEEPSEEK_API_KEY ? ['deepseek'] : []),
                    ...(env.KAGI_API_KEY ? ['kagi'] : []),
                  ],
            summaryAvailable: mode === 'byok' || Boolean(env.DEEPSEEK_API_KEY),
          });
        }
        if (!['/api/check-key', '/api/search', '/api/summary'].includes(url.pathname))
          throw new AppError('NOT_FOUND', 404);
        if (request.method !== 'POST') throw new AppError('METHOD_NOT_ALLOWED', 405);
        if (request.headers.get('origin') !== url.origin) throw new AppError('FORBIDDEN', 403);
        const data = object(
          await readJSON(
            request,
            url.pathname === '/api/summary' ? LIMITS.summaryBody : LIMITS.searchBody,
          ),
        );
        let query: ReturnType<typeof parseSearchInput> | undefined;
        let sources: ReturnType<typeof validateSources> | undefined;
        if (url.pathname === '/api/check-key') fields(data, []);
        else {
          fields(
            data,
            url.pathname === '/api/search'
              ? ['rawQuery', 'count', 'provider']
              : ['rawQuery', 'results'],
          );
          query = parseSearchInput(data.rawQuery);
          if (
            url.pathname === '/api/search' &&
            (typeof data.count !== 'number' || ![10, 20, LIMITS.searchResults].includes(data.count))
          )
            throw new AppError('INVALID_INPUT');
          if (url.pathname === '/api/summary') {
            if (query.mode !== 'answer') throw new AppError('AI_NOT_REQUESTED');
            sources = validateSources(data.results);
          }
        }
        const provider =
          url.pathname === '/api/search' ? searchProvider(data.provider) : 'deepseek';
        const { key, identity } = await resolveKey(request, env, authenticate, provider);
        if (!env.API_LIMITER) throw new AppError('CONFIG_ERROR', 503);
        if (!(await env.API_LIMITER.limit({ key: `${url.pathname}:${identity}` })).success)
          throw new AppError('RATE_LIMITED', 429);
        const upstreamAbort = new AbortController();
        const signal = AbortSignal.any([
          upstreamAbort.signal,
          requestSignal(
            request,
            url.pathname === '/api/summary' ? LIMITS.summaryTimeout : LIMITS.searchTimeout,
          ),
        ]);
        if (url.pathname === '/api/check-key') {
          await upstreamJSON(await callUpstream(fetcher, 'models', key, signal), signal);
          return json({ ok: true, requestId });
        }
        if (url.pathname === '/api/search') {
          if (provider === 'kagi') {
            return json({
              ...query!,
              ...(await searchKagi(fetcher, query!.query, Number(data.count), key, signal)),
              provider,
              requestId,
            });
          }
          const upstream = await callUpstream(fetcher, 'search', key, signal, {
            query: query!.query,
            count: data.count,
            need_content: false,
          });
          return json({
            ...query!,
            ...normalizeSearch(await upstreamJSON(upstream, signal), Number(data.count)),
            provider,
            requestId,
          });
        }
        const model = env.SUMMARY_MODEL ?? 'deepseek-flash';
        if (!['deepseek-flash', 'deepseek-v4-pro'].includes(model))
          throw new AppError('CONFIG_ERROR', 503);
        const upstream = await callUpstream(fetcher, 'summary', key, signal, {
          model,
          stream: true,
          reasoning_effort: 'none',
          max_tokens: LIMITS.outputTokens,
          messages: [
            { role: 'system', content: SUMMARY_PROMPT },
            { role: 'user', content: JSON.stringify({ query: query!.query, sources }) },
          ],
        });
        return secureResponse(
          new Response(relaySummary(upstream, signal, upstreamAbort), {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'X-Request-ID': requestId,
            },
          }),
        );
      } catch (error) {
        const safe = errorOf(error);
        return json({ error: { code: safe.code, requestId } }, safe.status);
      }
    },
  };
}

export default createWorker();
