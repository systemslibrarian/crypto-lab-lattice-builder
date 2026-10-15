import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4219/' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4219 --strictPort',
    url: 'http://127.0.0.1:4219/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
