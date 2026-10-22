import { describe, expect, it } from 'vitest';
import { readSSE } from '../shared/sse';
import { relaySummary } from '../worker/summary';
import { chunked, upstreamStream } from './fixtures';

describe('bounded SSE streaming', () => {
  it('handles byte-split UTF-8, CRLF, multiline data and heartbeats', async () => {
    const events = [];
    for await (const event of readSSE(
      chunked(': ping\r\n\r\nevent: delta\r\ndata: 中文😀\r\ndata: next\r\n\r\n'),
    ))
      events.push(event);
    expect(events).toEqual([{ event: 'delta', data: '中文😀\nnext' }]);
  });
  it('relays content and final usage but not reasoning', async () => {
    const output = await new Response(
      relaySummary(
        new Response(chunked(upstreamStream('中文😀 [1]'))),
        new AbortController().signal,
      ),
    ).text();
    expect(output).toContain('中文😀 [1]');
    expect(output).toContain('"promptTokens":40');
    expect(output).toContain('event: done');
    expect(output).not.toContain('reasoning_content');
  });
  it('reports premature termination instead of completion', async () => {
    const output = await new Response(
      relaySummary(
        new Response(chunked(upstreamStream('partial', false))),
        new AbortController().signal,
      ),
    ).text();
    expect(output).toContain('event: error');
    expect(output).not.toContain('event: done');
  });
  it('rejects malformed stream JSON without echoing it', async () => {
    const output = await new Response(
      relaySummary(
        new Response(chunked('data: private-bad-json\n\n')),
        new AbortController().signal,
      ),
    ).text();
    expect(output).toContain('event: error');
    expect(output).not.toContain('private-bad-json');
  });
  it('bounds upstream stream bytes', async () => {
    await expect(async () => {
      for await (const event of readSSE(chunked('data: oversized\n\n'), undefined, 4)) void event;
    }).rejects.toThrow('BODY_TOO_LARGE');
  });
  it('cancels a pending upstream reader when the browser cancels', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const abort = new AbortController();
    const stream = relaySummary(new Response(body), abort.signal, abort);
    await stream.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(abort.signal.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });
  it('bounds model output independently of requested token limits', async () => {
    const output = await new Response(
      relaySummary(new Response(upstreamStream('x'.repeat(12_001))), new AbortController().signal),
    ).text();
    expect(output).toContain('STREAM_ERROR');
    expect(output).not.toContain('event: done');
  });
});
