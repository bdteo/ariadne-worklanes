import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const configDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(configDir, 'fixtures/worklanes');
const visualPort = Number(process.env.ARIADNE_VISUAL_PORT ?? 3738);
const baseURL = `http://localhost:${visualPort}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --filter @ariadne-worklanes/core build && pnpm build && ARIADNE_WORKLANES_DIR="${fixtureDir}" next start -p ${visualPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
  ],
});
