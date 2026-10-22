import { AppError, LIMITS } from './contracts';

// Network chunks are arbitrary: UTF-8 characters and SSE lines may span chunks.
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  maxBytes: number = LIMITS.upstreamBody,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    event = 'message',
    data: string[] = [],
    total = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const chunk = await reader.read();
      if (signal?.aborted) throw signal.reason;
      if (chunk.done) buffer += decoder.decode();
      else {
        total += chunk.value.byteLength;
        if (total > maxBytes) throw new AppError('BODY_TOO_LARGE', 502);
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) yield { event, data: data.join('\n') };
          event = 'message';
          data = [];
        } else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (chunk.done) break;
    }
    // SSE dispatch requires a blank line. Partial trailing events are not accepted.
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
