import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Capture the real local UI with isolated, synthetic data. Never use a live Key.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/images/', import.meta.url);
const origin = 'http://127.0.0.1:4181';
const fakeKey = 'sk-invalid-docs-example-key';
const baseResults = [
  {
    title: 'CSS Grid：从二维布局开始',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout',
    siteName: 'MDN Web Docs',
    snippet: '网格布局可以同时安排页面的行与列。先认识容器、网格线和间距，再用一个小例子练习。',
    summary: 'CSS Grid 适合同时控制行与列的二维布局。',
  },
  {
    title: '用 Grid 搭建清晰的响应式页面',
    url: 'https://web.dev/learn/css/grid',
    siteName: 'web.dev',
    snippet: '从两列内容区到自适应卡片，了解如何用 repeat、minmax 和 gap 表达布局意图。',
    summary: '使用 repeat、minmax 和 gap 可以实现自适应网格。',
  },
  {
    title: 'grid-template-columns：定义网格的列',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/CSS/grid-template-columns',
    siteName: 'MDN Web Docs',
    snippet: '了解 fr 单位与列宽设置，结合浏览器开发者工具观察每一条网格线的位置。',
    summary: 'grid-template-columns 定义列宽，fr 按比例分配可用空间。',
  },
];
const calls = { search: 0, summary: 0 };
const blocked = [];
let browser;
let serverError;
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4181',
    '--strictPort',
  ],
  { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-4000);
  });
}
server.on('error', (error) => {
  serverError = error;
});

async function installFixtures(context) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      blocked.push(url.origin);
      return route.abort();
    }
    if (url.pathname === '/api/config')
      return route.fulfill({ json: { keyMode: 'byok', maxQueryLength: 128 } });
    if (url.pathname === '/api/check-key') return route.fulfill({ json: { ok: true } });
    if (url.pathname === '/api/search') {
      calls.search++;
      const { rawQuery, count } = route.request().postDataJSON();
      assert.equal(count, 50);
      const answer = /[?？]$/u.test(rawQuery.trim());
      const results = Array.from({ length: rawQuery === 'CSS Grid 示例' ? 12 : 3 }, (_, index) => ({
        ...baseResults[index % baseResults.length],
        id: index + 1,
        ...(index >= 3
          ? {
              title: `CSS Grid 布局练习 ${index + 1}（演示结果）`,
              url: `https://example.org/grid-demo/${index + 1}`,
              siteName: '布局练习 · 演示',
            }
          : {}),
        date: null,
        relevanceScore: Number((2.95 - index * 0.1).toFixed(2)),
        authority: index < 3 ? 4 : 2,
      }));
      return route.fulfill({
        json: {
          submittedQuery: rawQuery.trim(),
          query: rawQuery.trim().replace(/[?？]+$/u, ''),
          mode: answer ? 'answer' : 'search',
          results,
          requestedCount: count,
          receivedCount: results.length,
          discardedCount: 0,
          requestId: `docs-demo-${calls.search}`,
        },
      });
    }
    if (url.pathname === '/api/summary') {
      calls.summary++;
      const text =
        '可以先从一个两列布局开始：给父元素设置 display: grid，再用 grid-template-columns 定义列宽，最后用 gap 留出间距。Grid 同时控制行与列，适合卡片列表和页面分区。[1]\n\n需要适配不同屏幕时，可以继续学习 repeat() 与 minmax()。建议打开来源页面，对照示例代码逐步调整，并用浏览器开发者工具查看网格线。[2][3]';
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: delta\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {"usage":{"promptTokens":320,"completionTokens":120}}\n\n`,
      });
    }
    if (url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
}

async function capture(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, output)),
    fullPage: true,
    animations: 'disabled',
  });
}

try {
  for (let attempt = 0; ; attempt++) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Preview exited: ${serverLog}`);
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {
      // The preview server is still starting.
    }
    if (attempt >= 60) throw new Error(`Preview did not start: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'zh-CN',
    timezoneId: 'Europe/London',
  });
  await installFixtures(context);
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: '添加 API Key', exact: true }).waitFor();
  await capture(page, 'home');

  await page.getByRole('button', { name: '添加 API Key', exact: true }).click();
  await page.getByLabel('DeepSeek API Key', { exact: true }).fill(fakeKey);
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByText('连接成功。此检查不执行搜索，也不验证搜索权限或余额。').waitFor();
  // The displayed notice is a synthetic response, documented in the README.
  const dialog = await page.getByRole('dialog').boundingBox();
  const connection = await page.locator('.settings-section').first().boundingBox();
  assert.ok(dialog && connection);
  await page.screenshot({
    path: fileURLToPath(new URL('setup.png', output)),
    clip: {
      x: dialog.x,
      y: dialog.y,
      width: dialog.width,
      height: connection.y + connection.height - dialog.y,
    },
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '使用此密钥', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  async function submit(query) {
    const input = page.getByRole('textbox', { name: '搜索', exact: true });
    await input.fill(query);
    await input.press('Enter');
    await page.locator('.result-title').first().waitFor();
  }
  await submit('CSS Grid 入门');
  await capture(page, 'search');
  await submit('CSS Grid 应该怎么入门？');
  await page.getByRole('button', { name: '复制回答', exact: true }).waitFor();
  await capture(page, 'answer');
  await submit('CSS Grid 示例');
  const more = page.getByRole('button', { name: /显示更多结果/ });
  await more.scrollIntoViewIfNeeded();
  await page.locator('.more-results').screenshot({
    path: fileURLToPath(new URL('more-results.png', output)),
    animations: 'disabled',
  });
  const beforeExpand = { ...calls };
  await more.click();
  assert.deepEqual(calls, beforeExpand);
  await page.getByRole('button', { name: '检索记录', exact: true }).click();
  await page.getByRole('heading', { name: '留住你的探索路径', exact: true }).waitFor();
  await capture(page, 'history');
  await page.getByRole('button', { name: '每日用量', exact: true }).click();
  await page.getByRole('heading', { name: '每天，探索多一点', exact: true }).waitFor();
  await capture(page, 'usage');
  assert.equal(
    await page.evaluate((key) => JSON.stringify(localStorage).includes(key), fakeKey),
    false,
  );
  assert.deepEqual(calls, { search: 3, summary: 1 });
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'zh-CN',
  });
  await installFixtures(mobile);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin);
  await mobilePage.getByRole('button', { name: '添加 API Key', exact: true }).waitFor();
  await capture(mobilePage, 'mobile-dark');
  await mobile.close();
  assert.deepEqual(blocked, []);
  process.stdout.write('Saved 8 documentation screenshots; all API responses are synthetic.\n');
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
