import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // Each project renders a live WebGL canvas. Running four software-rendered
  // canvases at once starves their fixed-step simulations on headless runners.
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'iphone-portrait', use: { ...devices['iPhone 15 Pro Max'], viewport: { width: 440, height: 956 } } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 15 Pro Max'], browserName: 'webkit', viewport: { width: 440, height: 956 } } }
  ]
});
