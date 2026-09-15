// NVDA with Chrome on Windows, VoiceOver with Safari on macOS -- the two Web
// rows of the RFC verification matrices, and one browser per platform.
//
// Screen readers are singletons that need a headed browser with focus, so
// everything runs serially in one window (`screenReaderConfig`).

import { screenReaderConfig } from '@guidepup/playwright'
import { devices, type PlaywrightTestConfig } from '@playwright/test'

const port = 6180
const onMac = process.platform === 'darwin'

export default {
  ...screenReaderConfig,
  testDir: '.',
  testMatch: 'stories.spec.ts',
  // A screen reader walking a story is slow, and a first run on a fresh
  // runner is slower still.
  timeout: 5 * 60 * 1000,
  // Two, because the first run lost a first attempt on each of two stories
  // to `browser.newContext: Target … has been closed` while NVDA settled.
  retries: process.env.CI ? 2 : 0,
  reportSlowTests: null,
  outputDir: 'test-results/playwright',
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...screenReaderConfig.use,
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    onMac
      ? { name: 'webkit', use: { ...devices['Desktop Safari'], headless: false } }
      : { name: 'chromium', use: { ...devices['Desktop Chrome'], headless: false } },
  ],
  webServer: {
    command: `node serve-static.mjs ${port}`,
    url: `http://127.0.0.1:${port}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
} satisfies PlaywrightTestConfig
