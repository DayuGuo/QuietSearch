import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 960 } },
    },
    {
      name: 'mobile-dark',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', colorScheme: 'dark' },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://127.0.0.1:4173/api/config',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
