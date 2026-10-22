import { useEffect, useRef, useState } from 'react';
import { AppError, LIMITS, summarySources, type SearchResponse } from '../../shared/contracts';
import { parseSearchInput } from '../../shared/query-intent';
import * as api from '../lib/api';
import { activity, localDay } from '../lib/activity';

export type SummaryState = {
  status: 'idle' | 'loading' | 'done' | 'error' | 'cancelled';
  text: string;
  error?: string;
  truncated?: boolean;
};
const emptySummary: SummaryState = { status: 'idle', text: '' };
function errorCode(error: unknown) {
  return error instanceof AppError ? error.code : 'UPSTREAM_ERROR';
}

export function useSearch() {
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState<SummaryState>(emptySummary);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  const lock = useRef(false),
    snapshot = useRef<{ result: SearchResponse; day: string } | null>(null);
  const activeInput = useRef<string | null>(null);

  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );

  async function answer(
    value: SearchResponse,
    day: string,
    key: string,
    current: number,
    abort: AbortController,
  ) {
    const sources = summarySources(value.results);
    if (!sources.length || value.mode !== 'answer') return;
    setSummary({ status: 'loading', text: '' });
    activity.aiStart(day);
    try {
      const done = await api.summarize(
        value.submittedQuery,
        sources,
        key,
        abort.signal,
        (delta) => {
          if (generation.current === current)
            setSummary((previous) => ({ ...previous, text: previous.text + delta }));
        },
      );
      activity.aiUsage(day, done.usage);
      if (generation.current === current)
        setSummary((previous) => ({ ...previous, status: 'done', truncated: done.truncated }));
    } catch (failure) {
      if (generation.current === current)
        setSummary((previous) => ({
          ...previous,
          status: abort.signal.aborted ? 'cancelled' : 'error',
          error: errorCode(failure),
        }));
    }
  }

  async function submit(raw: string, key: string) {
    let input: ReturnType<typeof parseSearchInput>;
    try {
      input = parseSearchInput(raw);
    } catch (failure) {
      setError(errorCode(failure));
      return;
    }
    // Lock only the current JS event turn: double clicks cannot create two requests.
    const fingerprint = input.submittedQuery;
    if (lock.current || activeInput.current === fingerprint) return;
    activeInput.current = fingerprint;
    lock.current = true;
    queueMicrotask(() => {
      lock.current = false;
    });
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    snapshot.current = null;
    setResult(null);
    setSummary(emptySummary);
    setError(undefined);
    setLoading(true);
    const record = activity.start(input.submittedQuery, input.mode);
    try {
      const value = await api.search(input.submittedQuery, LIMITS.searchResults, key, abort.signal);
      activity.finish(record.id, record.day, 'success', value.results.length);
      if (generation.current !== current) return;
      snapshot.current = { result: value, day: record.day };
      setResult(value);
      setLoading(false);
      await answer(value, localDay(), key, current, abort);
    } catch (failure) {
      activity.finish(record.id, record.day, abort.signal.aborted ? 'cancelled' : 'failed');
      if (generation.current === current) {
        setLoading(false);
        setError(abort.signal.aborted ? undefined : errorCode(failure));
      }
    } finally {
      if (generation.current === current) activeInput.current = null;
    }
  }

  function stop() {
    controller.current?.abort();
    activeInput.current = null;
    setLoading(false);
    setSummary((previous) =>
      previous.status === 'loading' ? { ...previous, status: 'cancelled' } : previous,
    );
  }
  function clear() {
    generation.current++;
    stop();
    snapshot.current = null;
    setResult(null);
    setSummary(emptySummary);
    setError(undefined);
  }
  async function retry(key: string) {
    if (!snapshot.current || summary.status === 'loading') return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    await answer(snapshot.current.result, localDay(), key, current, abort);
  }
  return { result, loading, error, summary, submit, stop, retry, clear };
}
