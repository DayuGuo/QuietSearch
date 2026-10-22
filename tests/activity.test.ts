import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
let storage: MemoryStorage;
beforeEach(() => {
  vi.resetModules();
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('bounded browser-local activity', () => {
  it('records successful searches, result counts and AI usage separately', async () => {
    const { activity } = await import('../src/lib/activity');
    const entry = activity.start('test query?', 'answer');
    activity.finish(entry.id, entry.day, 'success', 10);
    activity.aiStart(entry.day);
    activity.aiUsage(entry.day, { promptTokens: 40, completionTokens: 10 });
    expect(activity.getSnapshot().days[0]).toMatchObject({
      searches: 1,
      successes: 1,
      results: 10,
      aiRequests: 1,
      promptTokens: 40,
      completionTokens: 10,
    });
    const serialized = [...storage.data.values()].join('');
    expect(serialized).toContain('test query?');
    expect(serialized).not.toContain('summary');
    expect(serialized).not.toContain('Authorization');
  });
  it('pauses queries while keeping anonymous numeric usage', async () => {
    const { activity } = await import('../src/lib/activity');
    activity.setPreferences({ historyEnabled: false });
    activity.start('do not save this query', 'search');
    expect(activity.getSnapshot().history).toHaveLength(0);
    expect([...storage.data.values()].join('')).not.toContain('do not save');
    expect(activity.getSnapshot().days[0].searches).toBe(1);
  });
  it('keeps at most 200 history entries and clears independently', async () => {
    const { activity } = await import('../src/lib/activity');
    for (let index = 0; index < 205; index++) activity.start(`query ${index}`, 'search');
    expect(activity.getSnapshot().history).toHaveLength(200);
    activity.clearHistory();
    expect(activity.getSnapshot().days[0].searches).toBe(205);
    activity.clearUsage();
    expect(activity.getSnapshot().days).toHaveLength(0);
  });
  it('drops unknown fields, corrupt rows, stale and future records', async () => {
    const { sanitizeActivity } = await import('../src/lib/activity');
    const result = sanitizeActivity(
      {
        history: [
          { id: 'old', query: 'old', at: '2025-01-01', status: 'success' },
          { id: 'future', query: 'future', at: '2030-01-01', status: 'success' },
          {
            id: 'good',
            query: '<script>untrusted</script>',
            at: '2026-10-21T12:00:00Z',
            status: 'pending',
            token: 'never copy this field',
          },
        ],
        days: [{ day: '2026-10-21', searches: -1, successes: 2, secret: 'do not copy' }],
      },
      new Date('2026-10-22T12:00:00Z'),
    );
    expect(result.history).toHaveLength(1);
    expect(result.history[0].status).toBe('cancelled');
    expect(JSON.stringify(result)).not.toContain('never copy');
    expect(JSON.stringify(result)).not.toContain('do not copy');
    expect(result.days[0].searches).toBe(0);
  });
  it('handles storage denial without breaking searches', async () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('quota');
      },
    });
    const { activity } = await import('../src/lib/activity');
    expect(() => activity.start('safe query', 'search')).not.toThrow();
    expect(activity.getSnapshot().storageAvailable).toBe(false);
  });
  it('ignores an injected key in preferences on load', async () => {
    storage.setItem(
      'quietsearch.preferences.v1',
      JSON.stringify({ theme: 'dark', apiKey: 'sk-not-a-real-key' }),
    );
    const { activity } = await import('../src/lib/activity');
    activity.setPreferences({ count: 20 });
    expect(activity.getSnapshot().preferences.theme).toBe('dark');
    expect([...storage.data.values()].join('')).not.toContain('sk-not-a-real-key');
  });
  it('can reload its own maximum-size valid history without losing records', async () => {
    const { activity } = await import('../src/lib/activity');
    for (let index = 0; index < 200; index++)
      activity.start(`query ${index}` + '?'.repeat(1700), 'answer');
    vi.resetModules();
    const reloaded = await import('../src/lib/activity');
    expect(reloaded.activity.getSnapshot().history).toHaveLength(200);
  });
});
