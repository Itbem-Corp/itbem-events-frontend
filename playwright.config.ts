import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load PUBLIC_EVENTS_URL from .env so test mock interceptors use the same
// base URL the running dev server is configured with.
// Workers inherit process.env from the main Playwright process (they are forked),
// so setting it here makes it available in all test helper files.
try {
  const envContent = readFileSync(join(process.cwd(), '.env'), 'utf-8');
  const match = envContent.match(/^PUBLIC_EVENTS_URL=(.+)$/m);
  if (match && !process.env['PUBLIC_EVENTS_URL']) {
    process.env['PUBLIC_EVENTS_URL'] = match[1].trim();
  }
} catch { /* .env missing — CI sets the var directly */ }

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321/graduacion-izapa',
    // Always start a fresh server so PUBLIC_EVENTS_URL in .env is guaranteed
    // to match the API_BASE used in mock interceptors.
    // Note: this stops any dev server already running on port 4321.
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
