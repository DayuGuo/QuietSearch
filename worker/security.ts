import { AppError, LIMITS } from '../shared/contracts';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  KEY_MODE?: string;
  DEEPSEEK_API_KEY?: string;
  SUMMARY_MODEL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  API_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export function secureResponse(response: Response, api = true) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
  // Vite injects refresh scripts and styles in development. Production builds
  // erase this branch and retain the strict policy above.
  if (!api && import.meta.env.DEV)
    headers.set(
      'Content-Security-Policy',
      securityHeaders['Content-Security-Policy']
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
    );
  if (api) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function json(value: unknown, status = 200) {
  return secureResponse(Response.json(value, { status }));
}

export async function readJSON(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new AppError('INVALID_INPUT', 415);
  if (!request.body) throw new AppError('INVALID_INPUT');
  const bytes = await readBytes(request.body, maxBytes, requestSignal(request, LIMITS.bodyTimeout));
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new AppError('INVALID_INPUT');
  }
}

export async function readBytes(
  body: ReadableStream<Uint8Array>,
  limit: number,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  // A fixed buffer also bounds memory when a peer sends many tiny chunks.
  const output = new Uint8Array(limit);
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (signal?.aborted) throw signal.reason;
      if (done) break;
      if (size + value.byteLength > limit) throw new AppError('BODY_TOO_LARGE', 413);
      output.set(value, size);
      size += value.byteLength;
    }
    return output.subarray(0, size);
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function requestSignal(request: Request, duration: number = LIMITS.searchTimeout) {
  return AbortSignal.any([request.signal, AbortSignal.timeout(duration)]);
}

export function errorOf(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
    return new AppError('TIMEOUT', 504);
  return new AppError('UPSTREAM_ERROR', 502);
}

export function upstreamError(status: number) {
  const mapping = { 401: 'INVALID_KEY', 402: 'INSUFFICIENT_BALANCE', 429: 'RATE_LIMITED' } as const;
  return new AppError(
    mapping[status as keyof typeof mapping] ?? 'UPSTREAM_ERROR',
    status in mapping ? status : 502,
  );
}
