import { test, expect, Page } from '@playwright/test';

const SEED_EMAIL = 'e2e_operator@company.com';
const SEED_PASSWORD = 'e2e_test_pass_123';
const SEED_TENANT = 'E2E Test Corp';

async function seedB2BUser(page: Page) {
    const response = await page.request.post('/api/v1/test/seed-b2b', {
        data: { tenant_name: SEED_TENANT, email: SEED_EMAIL, password: SEED_PASSWORD }
    });
    expect(response.ok()).toBeTruthy();
}

test.describe('B2B Authentication Flow', () => {
    test.beforeEach(async ({ page }) => { await seedB2BUser(page); });

    test('Login page renders correctly', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('#login-email')).toBeVisible();
        await expect(page.locator('#login-password')).toBeVisible();
        await expect(page.locator('#login-submit')).toBeVisible();
    });

    test('Successful login redirects to dashboard', async ({ page }) => {
        await page.goto('/login');
        await page.fill('#login-email', SEED_EMAIL);
        await page.fill('#login-password', SEED_PASSWORD);

        await Promise.all([
            page.waitForResponse('**/api/v1/auth/login'),
            page.click('#login-submit')
        ]);

        await page.waitForURL('**/dashboard');
        await expect(page.locator('[data-testid="dashboard-heading"]')).toBeVisible();
    });

    test('Wrong password shows error', async ({ page }) => {
        await page.goto('/login');
        await page.fill('#login-email', SEED_EMAIL);
        await page.fill('#login-password', 'wrong_password');
        await page.click('#login-submit');
        await expect(page.locator('#login-error')).toBeVisible();
    });

    test('Dashboard is protected — redirects unauthenticated to /login', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.goto('/dashboard');
        await page.waitForURL('**/login');
    });
});

test.describe('B2B Dashboard Flow', () => {
    test.beforeEach(async ({ page }) => {
        await seedB2BUser(page);
        await page.goto('/login');
        await page.fill('#login-email', SEED_EMAIL);
        await page.fill('#login-password', SEED_PASSWORD);

        await Promise.all([
            page.waitForResponse('**/api/v1/auth/login'),
            page.click('#login-submit')
        ]);

        await page.waitForURL('**/dashboard');
    });

    test('Create a queue with form schema', async ({ page }) => {
        await page.click('[data-testid="new-queue-btn"]');
        await page.fill('#queue-name', 'Caixa Priority');
        await page.fill('[data-testid="schema-field-name-0"]', 'nome');
        await page.click('#add-field-btn');
        await page.fill('[data-testid="schema-field-name-1"]', 'cpf');
        await page.click('#create-queue-submit');
        await expect(page.locator('#create-success')).toBeVisible();
        await expect(page.locator('#queue-list')).toContainText('Caixa Priority');
    });

    test('View QR code for a queue', async ({ page }) => {
        const queueName = `QR Test Queue ${Date.now()}`;
        await page.click('[data-testid="new-queue-btn"]');
        await page.fill('#queue-name', queueName);
        await page.fill('[data-testid="schema-field-name-0"]', 'name');
        await page.click('#create-queue-submit');
        await expect(page.locator('#create-success')).toBeVisible();

        // Get queue ID from list item
        const queueItem = page.locator('.queue-item', { hasText: queueName }).first();
        await expect(queueItem).toBeVisible();
        const testId = await queueItem.getAttribute('data-testid') ?? '';
        const queueId = testId.replace('queue-item-', '');

        // Navigate to QR display page and verify QR is rendered
        await page.goto(`/display/qr?q=${queueId}`);
        await page.locator('#qr-display-img').waitFor({ state: 'visible', timeout: 8000 });
    });

    test('Logout returns to login page', async ({ page }) => {
        await page.click('#logout-btn');
        await page.waitForURL('**/login');
    });
});
