import { describe, expect, it } from 'vitest';
import { parseSearchInput } from '../shared/query-intent';
import { AppError } from '../shared/contracts';

describe('shared production query parser', () => {
  it.each([
    ['肝纤维化 超声', 'search', '肝纤维化 超声'],
    ['为什么天空是蓝色的', 'search', '为什么天空是蓝色的'],
    ['问题?', 'answer', '问题'],
    ['问题？', 'answer', '问题'],
    [' 问题？   ', 'answer', '问题'],
    ['问题?\n', 'answer', '问题'],
    ['问题?\t', 'answer', '问题'],
    ['问题？\u3000', 'answer', '问题'],
    ['问题??', 'answer', '问题'],
    ['问题？？', 'answer', '问题'],
    ['问题?？', 'answer', '问题'],
    ['问题 ?？', 'answer', '问题'],
    ['甲？乙', 'search', '甲？乙'],
    ['https://example.org/?q=test', 'search', 'https://example.org/?q=test'],
    ['问题？。', 'search', '问题？。'],
    ['"问题？"', 'search', '"问题？"'],
    ['问题? text', 'search', '问题? text'],
    [' What is fibrosis? ', 'answer', 'What is fibrosis'],
    ['https://example.org/?', 'answer', 'https://example.org/'],
    ['甲？乙？', 'answer', '甲？乙'],
    ['😀'.repeat(128) + '？', 'answer', '😀'.repeat(128)],
    ['a'.repeat(128) + '?', 'answer', 'a'.repeat(128)],
  ])('%j → %s', (raw, mode, query) => {
    expect(parseSearchInput(raw)).toEqual({ submittedQuery: raw.trim(), mode, query });
  });
  it.each([
    '',
    '   ',
    '?',
    '？？',
    '? ？',
    '?\n？',
    '\t\u3000',
    null,
    123,
    'a'.repeat(129) + '?',
    '😀'.repeat(129) + '？',
  ])('rejects %j', (raw) => {
    expect(() => parseSearchInput(raw)).toThrow(AppError);
  });
  it('limits original bytes even when question marks are stripped', () => {
    expect(() => parseSearchInput('query' + '?'.repeat(3000))).toThrow('BODY_TOO_LARGE');
  });
  it('preserves question marks separated by spaces inside valid content', () => {
    expect(parseSearchInput('query? ？').query).toBe('query?');
  });
});
