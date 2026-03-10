import { test, expect, Page } from '@playwright/test';

const SEED_EMAIL = 'mgmt_operator@company.com';
const SEED_PASSWORD = 'mgmt_test_pass_456';
const SEED_TENANT = 'Queue Mgmt Test Corp';

async function seedB2BUser(page: Page) {
    const response = await page.request.post('/api/v1/test/seed-b2b', {
        data: { tenant_name: SEED_TENANT, email: SEED_EMAIL, password: SEED_PASSWORD }
    });
    expect(response.ok()).toBeTruthy();
}

async function loginAndCreateQueue(page: Page, queueName: string): Promise<string> {
    await page.goto('/login');
    await page.fill('#login-email', SEED_EMAIL);
    await page.fill('#login-password', SEED_PASSWORD);
    await page.click('#login-submit');
    await page.waitForURL('**/dashboard');

    // Create a test queue
    await page.fill('#queue-name', queueName);
    await page.fill('[data-testid="schema-field-name-0"]', 'nome');
    await page.click('#create-queue-submit');
    await expect(page.locator('#create-success')).toBeVisible();

    // Get queue ID from list item
    const queueItem = page.locator('.queue-item').first();
    await expect(queueItem).toBeVisible();
    const testId = await queueItem.getAttribute('data-testid') ?? '';
    return testId.replace('queue-item-', '');
}

async function addMemberToQueue(page: Page, queueId: string, tenantToken: string, nome: string) {
    // Join queue as B2C user via API
    const joinResp = await page.request.post('/api/v1/queue/join', {
        data: { queue_id: queueId, user_data: { nome } }
    });
    expect(joinResp.ok()).toBeTruthy();
}

test.describe('Queue Management Dashboard', () => {
    test.beforeEach(async ({ page }) => { await seedB2BUser(page); });

    test('Clicking queue navigates to management page', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'Manage Test Queue');
        await page.locator('.queue-item').first().click();
        await page.waitForURL(`**/dashboard/queue/${queueId}`);
        await expect(page.locator('h1')).toContainText('Manage Test Queue');
    });

    test('Empty queue shows empty state', async ({ page }) => {
        await loginAndCreateQueue(page, 'Empty Queue Test');
        await page.locator('.queue-item').first().click();
        await page.locator('text=Queue is empty').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('#members-table')).not.toBeVisible();
    });

    test('Call Next on empty queue shows error', async ({ page }) => {
        await loginAndCreateQueue(page, 'Call Next Empty Test');
        await page.locator('.queue-item').first().click();
        await page.locator('#call-next-btn').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('#call-next-btn')).toBeDisabled();
    });

    test('Members appear in table after joining', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'Member Table Test');

        // Add members via API
        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Alice' } }
        });
        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Bob' } }
        });

        // Navigate to management and check table
        await page.goto(`/dashboard/queue/${queueId}`);
        await page.locator('#members-table').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('[data-testid="member-row-0"]')).toBeVisible();
        await expect(page.locator('[data-testid="member-row-1"]')).toBeVisible();
        await expect(page.locator('text=Alice')).toBeVisible();
        await expect(page.locator('text=Bob')).toBeVisible();
    });

    test('Call Next removes first member and shows banner', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'Call Next Test');
        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'First Person' } }
        });
        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Second Person' } }
        });

        await page.goto(`/dashboard/queue/${queueId}`);
        await page.locator('#members-table').waitFor({ state: 'visible', timeout: 8000 });

        await page.click('#call-next-btn');
        await page.locator('#called-user-banner').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('#called-user-banner')).toContainText('First Person');

        // Only 1 member left
        await expect(page.locator('[data-testid="member-row-0"]')).toBeVisible();
        await expect(page.locator('[data-testid="member-row-1"]')).not.toBeVisible();
    });

    test('Remove button removes a member', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'Remove Member Test');
        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Remove Me' } }
        });

        await page.goto(`/dashboard/queue/${queueId}`);
        await page.locator('#members-table').waitFor({ state: 'visible', timeout: 8000 });
        await page.click('[data-testid="remove-btn-0"]');

        // Queue empty again
        await page.locator('text=Queue is empty').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('#members-table')).not.toBeVisible();
    });

    test('Clear All removes all members', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'Clear All Test');
        for (const nome of ['A', 'B', 'C']) {
            await page.request.post('/api/v1/queue/join', {
                data: { queue_id: queueId, user_data: { nome } }
            });
        }

        await page.goto(`/dashboard/queue/${queueId}`);
        await page.locator('#members-table').waitFor({ state: 'visible', timeout: 8000 });

        // Mock confirm dialog
        page.on('dialog', dialog => dialog.accept());
        await page.click('#clear-all-btn');

        await page.locator('text=Queue is empty').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('#members-table')).not.toBeVisible();
    });

    test('Back button returns to dashboard', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'Back Button Test');
        await page.goto(`/dashboard/queue/${queueId}`);
        await page.click('text=← Back to Dashboard');
        await page.waitForURL('**/dashboard');
    });

    test('QR Code button in Dashboard opens modal without navigating', async ({ page }) => {
        const queueId = await loginAndCreateQueue(page, 'QR Modal Test');
        await page.click(`[data-testid="qr-btn-${queueId}"]`);
        await expect(page.locator('#qr-code-img')).toBeVisible();
        // Should still be on dashboard URL
        await expect(page).toHaveURL(/dashboard$/);
    });
});
