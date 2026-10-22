import { test, expect, type Page } from '@playwright/test';
import { fixtureResults, sources } from '../fixtures';
import { mkdir } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const dummyKey = 'sk-invalid-synthetic-browser-key';
async function fixtures(
  page: Page,
  options: {
    summaryError?: boolean;
    holdSummary?: boolean;
    hostile?: boolean;
    resultCount?: number;
  } = {},
) {
  const counts = { search: 0, summary: 0, models: 0 };
  let release: (() => void) | undefined;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config') {
      await route.continue();
      return;
    }
    if (path === '/api/check-key') {
      counts.models++;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (path === '/api/search') {
      counts.search++;
      const { rawQuery, count } = route.request().postDataJSON() as {
        rawQuery: string;
        count: number;
      };
      expect(count).toBe(50);
      const mode = /[?？]$/.test(rawQuery.trim()) ? 'answer' : 'search';
      const query =
        mode === 'answer'
          ? rawQuery
              .trim()
              .replace(/[?？]+$/, '')
              .trimEnd()
          : rawQuery.trim();
      await route.fulfill({
        json: {
          submittedQuery: rawQuery.trim(),
          query,
          mode,
          results:
            rawQuery === 'empty?'
              ? []
              : Array.from({ length: options.resultCount ?? fixtureResults.length }, (_, index) => {
                  const item = fixtureResults[index % fixtureResults.length];
                  return {
                    id: index + 1,
                    title: options.hostile
                      ? '<img src=x onerror=alert(1)>'
                      : index < 2
                        ? item.title
                        : `Synthetic result ${index + 1}`,
                    url: index < 2 ? item.url : `https://example.org/result-${index + 1}`,
                    siteName: item.site_name,
                    snippet: item.snippet,
                    summary: item.summary,
                    date: item.date,
                    relevanceScore: Number(((index * 3) / 50).toFixed(2)),
                    authority: index % 5,
                  };
                }),
          requestedCount: count,
          receivedCount: rawQuery === 'empty?' ? 0 : (options.resultCount ?? fixtureResults.length),
          discardedCount: 0,
          requestId: `synthetic-${counts.search}`,
        },
      });
      return;
    }
    if (path === '/api/summary') {
      counts.summary++;
      if (options.holdSummary)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (options.summaryError) {
        await route
          .fulfill({ status: 502, json: { error: { code: 'UPSTREAM_ERROR' } } })
          .catch(() => undefined);
        return;
      }
      const text = options.hostile
        ? '<img src=x onerror=alert(1)> unsafe text [999] [1]'
        : 'Synthetic answer: explore with clear sources and check original pages. [1][2]';
      await route
        .fulfill({
          contentType: 'text/event-stream',
          body: `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {"usage":{"promptTokens":40,"completionTokens":15}}\n\n`,
        })
        .catch(() => undefined);
      return;
    }
    await route.abort();
  });
  return { counts, options, release: () => release?.() };
}
async function addKey(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('DeepSeek API Key', { exact: true }).fill(dummyKey);
  await page.getByRole('button', { name: '使用此密钥', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
}
async function query(page: Page, text: string) {
  await page.getByRole('textbox', { name: '搜索', exact: true }).fill(text);
  await page.getByRole('textbox', { name: '搜索', exact: true }).press('Enter');
}

test('first-run setup, free connection test, and no automatic search', async ({ page }) => {
  const { counts } = await fixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '先连接你的 DeepSeek' })).toBeVisible();
  await query(page, 'synthetic pending query');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('DeepSeek API Key', { exact: true }).fill(dummyKey);
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(
    page.getByText('连接成功。此检查不执行搜索，也不验证搜索权限或余额。'),
  ).toBeVisible();
  expect(counts).toEqual({ search: 0, summary: 0, models: 1 });
  await page.getByRole('button', { name: '使用此密钥' }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索', exact: true })).toHaveValue(
    'synthetic pending query',
  );
  expect(counts.search).toBe(0);
});

test('ordinary search never calls AI; key is memory-only; history persists', async ({ page }) => {
  const { counts } = await fixtures(page);
  await page.goto('/');
  await addKey(page);
  await query(page, 'synthetic web query');
  await expect(page.getByRole('link', { name: fixtureResults[0].title })).toBeVisible();
  expect(counts).toEqual({ search: 1, summary: 0, models: 0 });
  await expect(page.getByRole('region', { name: 'AI 回答', exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    cookie: document.cookie,
    title: document.title,
    url: location.href,
  }));
  expect(JSON.stringify(stored)).not.toContain(dummyKey);
  expect(stored.url).not.toContain('synthetic');
  expect(stored.title).toBe('QuietSearch');
  await page.reload();
  await expect(page.getByRole('button', { name: '添加 API Key', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '检索记录', exact: true }).click();
  await expect(page.getByRole('button', { name: /synthetic web query/ }).first()).toBeVisible();
  await page.getByRole('button', { name: '每日用量', exact: true }).click();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
});

test('question input calls AI once, uses valid citations, and counts result volume', async ({
  page,
}) => {
  const { counts } = await fixtures(page);
  await page.goto('/');
  await addKey(page);
  await page.getByRole('textbox', { name: '搜索', exact: true }).fill('synthetic question？');
  expect(counts.search).toBe(0);
  expect(counts.summary).toBe(0);
  await page.getByRole('textbox', { name: '搜索', exact: true }).press('Enter');
  await expect(page.getByText(/Synthetic answer:/)).toBeVisible();
  expect(counts).toEqual({ search: 1, summary: 1, models: 0 });
  const answer = page.getByRole('region', { name: 'AI 回答', exact: true });
  await expect(answer.getByRole('link', { name: '1', exact: true })).toHaveAttribute(
    'href',
    sources[0].url,
  );
  await page.getByRole('button', { name: '每日用量', exact: true }).click();
  await expect(page.getByText('已报告 tokens: 55')).toBeVisible();
});

test('summary failure preserves results; retry uses the original snapshot', async ({ page }) => {
  const state = await fixtures(page, { summaryError: true });
  await page.goto('/');
  await addKey(page);
  await query(page, 'original question?');
  await expect(page.getByText(/搜索结果已就绪，AI 回答暂时不可用/)).toBeVisible();
  await expect(page.getByRole('link', { name: fixtureResults[0].title })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索', exact: true }).fill('unsubmitted replacement');
  let submitted: unknown;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/summary')) submitted = request.postDataJSON();
  });
  state.options.summaryError = false;
  await page.getByRole('button', { name: '重试摘要' }).click();
  await expect(page.getByText(/Synthetic answer:/)).toBeVisible();
  expect(state.counts.search).toBe(1);
  expect(state.counts.summary).toBe(2);
  expect(submitted).toMatchObject({ rawQuery: 'original question?' });
});

test('new ordinary query cancels and isolates an old answer', async ({ page }) => {
  const state = await fixtures(page, { holdSummary: true });
  await page.goto('/');
  await addKey(page);
  await query(page, 'old question?');
  await expect(page.getByText('正在阅读来源摘要…')).toBeVisible();
  await query(page, 'new ordinary query');
  state.release();
  await expect(page.getByRole('link', { name: fixtureResults[0].title })).toBeVisible();
  await expect(page.getByRole('region', { name: 'AI 回答', exact: true })).toHaveCount(0);
  expect(state.counts.search).toBe(2);
  expect(state.counts.summary).toBe(1);
});

test('empty and invalid inputs do not call the model', async ({ page }) => {
  const { counts } = await fixtures(page);
  await page.goto('/');
  await addKey(page);
  await query(page, '？ ？');
  await expect(page.getByRole('alert')).toContainText('请输入关键词');
  expect(counts.search).toBe(0);
  await query(page, 'empty?');
  await expect(page.getByRole('heading', { name: '暂时没有找到结果' })).toBeVisible();
  expect(counts.summary).toBe(0);
});

test('untrusted titles and answers render as text; no remote assets load', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await fixtures(page, { hostile: true });
  await page.goto('/');
  await addKey(page);
  await query(page, 'synthetic hostile source?');
  await expect(
    page.getByRole('link', { name: '<img src=x onerror=alert(1)>' }).first(),
  ).toBeVisible();
  await expect(page.getByText(/unsafe text \[999\]/)).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  expect(requests.every((url) => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
});

test('history can be paused, filled without a request, deleted and cleared', async ({ page }) => {
  const { counts } = await fixtures(page);
  await page.goto('/');
  await addKey(page);
  await query(page, 'recorded synthetic query');
  await expect(page.getByRole('link', { name: fixtureResults[0].title })).toBeVisible();
  await page.getByRole('button', { name: '检索记录', exact: true }).click();
  await page.getByRole('button', { name: /填入搜索框: recorded/ }).click();
  expect(counts.search).toBe(1);
  await expect(page.getByRole('textbox', { name: '搜索', exact: true })).toHaveValue(
    'recorded synthetic query',
  );
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('switch', { name: /保存检索记录/ }).uncheck();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await query(page, 'not recorded');
  await expect(page.getByRole('link', { name: fixtureResults[0].title })).toBeVisible();
  await page.getByRole('button', { name: '检索记录', exact: true }).click();
  await expect(page.getByRole('button', { name: /填入搜索框: not recorded/ })).toHaveCount(0);
  await page.getByRole('button', { name: '清除检索记录', exact: true }).click();
  await page.getByRole('button', { name: '确认清除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '这里还没有检索记录' })).toBeVisible();
});

test('theme, language, keyboard, and responsive layout work', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).selectOption('dark');
  await page.getByLabel('界面语言', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('production Worker serves strict security headers and rejects invalid API calls', async ({
  request,
}) => {
  const html = await request.get('/');
  expect(html.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(html.headers()['content-security-policy']).not.toContain('unsafe-inline');
  const invalid = await request.post('/api/summary', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { rawQuery: 'no question', results: sources },
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).toContain('AI_NOT_REQUESTED');
  expect(invalid.headers()['cache-control']).toBe('no-store');
});

test('capture synthetic review screenshots', async ({ page }, info) => {
  await mkdir('artifacts', { recursive: true });
  await fixtures(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '好奇心，值得一个清晰的答案。' })).toBeVisible();
  await page.screenshot({
    path: `artifacts/home-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await addKey(page);
  await query(page, 'synthetic question?');
  await expect(page.getByText(/Synthetic answer:/)).toBeVisible();
  await page.screenshot({
    path: `artifacts/results-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '每日用量', exact: true }).click();
  await page.screenshot({
    path: `artifacts/usage-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '检索记录', exact: true }).click();
  await page.screenshot({
    path: `artifacts/history-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.screenshot({
    path: `artifacts/settings-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
});

test('home, settings, results, history and usage pass automated accessibility checks', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/');
  const scan = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((item) => ({
        id: item.id,
        targets: item.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  };
  await scan();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await scan();
  await page.getByLabel('DeepSeek API Key', { exact: true }).fill(dummyKey);
  await page.getByRole('button', { name: '使用此密钥' }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await query(page, 'synthetic accessibility question?');
  await expect(page.getByText(/Synthetic answer:/)).toBeVisible();
  await scan();
  await page.getByRole('button', { name: '检索记录', exact: true }).click();
  await scan();
  await page.getByRole('button', { name: '每日用量', exact: true }).click();
  await scan();
});

test('double submission is suppressed and IME composition does not submit', async ({ page }) => {
  const state = await fixtures(page, { holdSummary: true });
  await page.goto('/');
  await addKey(page);
  const input = page.getByRole('textbox', { name: '搜索', exact: true });
  await input.fill('synthetic composition?');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  expect(state.counts.search).toBe(0);
  await input.dispatchEvent('compositionend');
  await page.locator('button[type="submit"]').dblclick();
  await expect(page.getByText('正在阅读来源摘要…')).toBeVisible();
  expect(state.counts.search).toBe(1);
  expect(state.counts.summary).toBe(1);
  state.release();
  await expect(page.getByText(/Synthetic answer:/)).toBeVisible();
});

test('shows additional batches without another search, AI call or duplicate usage', async ({
  page,
}, info) => {
  const state = await fixtures(page, { resultCount: 35 });
  await page.goto('/');
  await addKey(page);
  await query(page, 'extended ordinary search');
  await expect(page.locator('.result-list > li')).toHaveCount(10);
  await expect(page.getByText('已显示 10 / 35 条结果', { exact: true })).toBeVisible();
  // Editing a draft must not change the retrieval snapshot or submit it.
  await page.getByRole('textbox', { name: '搜索', exact: true }).fill('unsubmitted draft');
  for (const count of [20, 30, 35]) {
    await page.getByRole('button', { name: /显示更多结果/ }).click();
    await expect(page.locator('.result-list > li')).toHaveCount(count);
  }
  await expect(page.getByRole('button', { name: /显示更多结果/ })).toHaveCount(0);
  expect(state.counts).toEqual({ search: 1, summary: 0, models: 0 });
  const ids = await page.locator('.source-number').allTextContents();
  expect(new Set(ids).size).toBe(35);
  await page.getByLabel('列表排序', { exact: true }).selectOption('score');
  await expect(page.locator('.result-list > li')).toHaveCount(10);
  await expect(page.locator('.result-list > li').first().getByRole('link')).toHaveText(
    'Synthetic result 35',
  );
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({
    path: `artifacts/more-results-${info.project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '每日用量', exact: true }).click();
  await expect(page.getByRole('cell', { name: '35', exact: true })).toBeVisible();
  expect(state.counts.search).toBe(1);
});

test('sorting preserves the original AI answer and stable citation IDs', async ({ page }) => {
  const state = await fixtures(page, { resultCount: 35 });
  await page.goto('/');
  await addKey(page);
  await query(page, 'extended question?');
  await expect(page.getByText(/Synthetic answer:/)).toBeVisible();
  await page.getByLabel('列表排序', { exact: true }).selectOption('authority');
  await expect(page.locator('.result-list > li').first().locator('.source-number')).toHaveText(
    '05',
  );
  await expect(
    page
      .getByRole('region', { name: 'AI 回答', exact: true })
      .getByRole('link', { name: '1', exact: true }),
  ).toHaveAttribute('href', sources[0].url);
  await page.getByRole('button', { name: /显示更多结果/ }).click();
  expect(state.counts).toEqual({ search: 1, summary: 1, models: 0 });
  await query(page, 'a new ordinary search');
  await expect(page.locator('.result-list > li')).toHaveCount(10);
  await expect(page.getByLabel('列表排序', { exact: true })).toHaveValue('default');
  await expect(page.getByRole('region', { name: 'AI 回答', exact: true })).toHaveCount(0);
});

test('explains a short upstream response without offering a fictitious next page', async ({
  page,
}) => {
  const state = await fixtures(page, { resultCount: 8 });
  await page.goto('/');
  await addKey(page);
  await query(page, 'short synthetic response');
  await expect(page.locator('.result-list > li')).toHaveCount(8);
  await expect(page.getByRole('button', { name: /显示更多结果/ })).toHaveCount(0);
  await page.getByText('排序与结果数量说明', { exact: true }).click();
  await expect(
    page.getByText('请求获取: 50 · 上游返回: 8 · 无效或重复: 0 · 保留结果: 8', { exact: true }),
  ).toBeVisible();
  expect(state.counts).toEqual({ search: 1, summary: 0, models: 0 });
});
