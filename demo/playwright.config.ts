import { defineConfig } from '@playwright/test';

const isHeadless = process.env.DEMO_HEADLESS === 'true';

export default defineConfig({
    testDir: '.',
    testMatch: 'demo.spec.ts',
    timeout: 300_000,        // 5 min — demo is long
    retries: 0,
    workers: 1,
    reporter: 'list',

    use: {
        baseURL: 'http://localhost:3000',
        headless: isHeadless,
        viewport: isHeadless ? { width: 1280, height: 800 } : null,
        launchOptions: {
            slowMo: 60,
            ...(isHeadless ? {} : { args: ['--start-fullscreen'] }),
        },
        video: 'on',
        trace: 'off',
        screenshot: 'on',
    },

    projects: [
        {
            name: 'demo',
            use: { browserName: 'chromium' },
        },
    ],
});
