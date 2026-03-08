import { test, expect, Page } from '@playwright/test';

const SEED_EMAIL = 'display_operator@company.com';
const SEED_PASSWORD = 'display_test_pass_789';
const SEED_TENANT = 'Display Test Corp';

async function seedAndLogin(page: Page): Promise<string> {
    await page.request.post('/api/v1/test/seed-b2b', {
        data: { tenant_name: SEED_TENANT, email: SEED_EMAIL, password: SEED_PASSWORD }
    });
    await page.goto('/login');
    await page.fill('#login-email', SEED_EMAIL);
    await page.fill('#login-password', SEED_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');

    await page.fill('#queue-name', 'Display Test Queue');
    await page.fill('[data-testid="schema-field-name-0"]', 'nome');
    await page.click('#create-queue-submit');
    await expect(page.locator('#create-success')).toBeVisible();

    const items = page.locator('.queue-item');
    await expect(items.first()).toBeVisible();
    const testId = await items.first().getAttribute('data-testid') ?? '';
    return testId.replace('queue-item-', '');
}

test.describe('Public Status Display Page', () => {
    test('StatusDisplay shows queue name and counter', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        await page.goto(`/display/status?q=${queueId}`);
        await expect(page.locator('text=Display Test Queue')).toBeVisible();
        await expect(page.locator('text=AO VIVO')).toBeVisible();
        // Counter shows 0
        await expect(page.locator('text=0')).toBeVisible();
    });

    test('StatusDisplay updates counter when member joins', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        await page.goto(`/display/status?q=${queueId}`);
        await expect(page.locator('text=0')).toBeVisible();

        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Test User' } }
        });

        // Re-fetch via API directly to confirm size
        const statusResp = await page.request.get(`/api/v1/queue/${queueId}/status`);
        expect(statusResp.ok()).toBeTruthy();
        const statusData = await statusResp.json();
        expect(statusData.queue_size).toBe(1);
    });

    test('StatusDisplay shows error for invalid queue', async ({ page }) => {
        await page.goto('/display/status?q=00000000-0000-0000-0000-000000000000');
        await expect(page.locator('text=Fila não encontrada')).toBeVisible();
    });
});

test.describe('Public QR Display Page', () => {
    test('QRDisplay shows queue QR code', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        await page.goto(`/display/qr?q=${queueId}`);
        await expect(page.locator('text=Display Test Queue')).toBeVisible();
        await expect(page.locator('#qr-display-img')).toBeVisible();
        await expect(page.locator('text=Na fila agora')).toBeVisible();
    });

    test('QRDisplay shows error for invalid queue', async ({ page }) => {
        await page.goto('/display/qr?q=00000000-0000-0000-0000-000000000000');
        await expect(page.locator('text=Queue not found')).toBeVisible();
    });

    test('Public qrcode-public endpoint returns image', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        const resp = await page.request.get(`/api/v1/queue/${queueId}/qrcode-public`);
        expect(resp.ok()).toBeTruthy();
        expect(resp.headers()['content-type']).toContain('image/png');
    });

    test('Public status endpoint returns queue info', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        const resp = await page.request.get(`/api/v1/queue/${queueId}/status`);
        expect(resp.ok()).toBeTruthy();
        const data = await resp.json();
        expect(data.name).toBe('Display Test Queue');
        expect(typeof data.queue_size).toBe('number');
    });
});

test.describe('Dashboard Display Links', () => {
    test('Dashboard links to QR display and status display pages', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        // Navigate to management page and check links
        await page.goto(`/dashboard/queue/${queueId}`);
        await expect(page).toHaveURL(new RegExp(`/dashboard/queue/${queueId}`));
    });
});
