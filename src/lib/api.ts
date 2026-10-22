import {
  AppError,
  type PublicConfig,
  type SearchResponse,
  type SearchProvider,
  type Source,
  type Usage,
} from '../../shared/contracts';
import { readSSE } from '../../shared/sse';

async function checked(response: Response) {
  if (!response.ok) {
    let code = 'UPSTREAM_ERROR';
    try {
      const body = (await response.json()) as { error?: { code?: string } };
      code = body.error?.code ?? code;
    } catch {
      /* Do not expose raw server responses. */
    }
    throw new AppError(code as AppError['code'], response.status);
  }
  return response;
}

export async function config(signal: AbortSignal): Promise<PublicConfig> {
  return (await checked(await fetch('/api/config', { signal, cache: 'no-store' }))).json();
}
async function post(path: string, body: unknown, key: string, signal: AbortSignal) {
  return checked(
    await fetch(`/api/${path}`, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
export async function checkKey(key: string, signal: AbortSignal) {
  await post('check-key', {}, key, signal);
}
export async function search(
  rawQuery: string,
  count: number,
  key: string,
  signal: AbortSignal,
  provider: SearchProvider,
): Promise<SearchResponse> {
  return (await post('search', { rawQuery, count, provider }, key, signal)).json();
}
export async function summarize(
  rawQuery: string,
  results: Source[],
  key: string,
  signal: AbortSignal,
  onDelta: (text: string) => void,
) {
  const response = await post('summary', { rawQuery, results }, key, signal);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new AppError('STREAM_ERROR');
  for await (const event of readSSE(response.body, signal)) {
    const data = JSON.parse(event.data) as {
      text?: string;
      code?: AppError['code'];
      usage?: Usage;
      truncated?: boolean;
    };
    if (event.event === 'delta' && typeof data.text === 'string') onDelta(data.text);
    if (event.event === 'error') throw new AppError(data.code ?? 'STREAM_ERROR');
    if (event.event === 'done') return { usage: data.usage, truncated: Boolean(data.truncated) };
  }
  throw new AppError('STREAM_ERROR');
}
