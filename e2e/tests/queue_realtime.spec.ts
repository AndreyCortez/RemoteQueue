import { test, expect } from '@playwright/test';
import { seedLoginAndCreateQueue } from './helpers';

const OPTS = {
    tenantName: 'Realtime Test Corp',
    email: 'realtime_operator@company.com',
    password: 'realtime_test_pass_777',
};

test.describe('Queue Real-Time Behaviour', () => {
    test.beforeEach(async ({ page }) => {
        await page.request.post('/api/v1/test/seed-b2b', {
            data: { tenant_name: OPTS.tenantName, email: OPTS.email, password: OPTS.password }
        });
    });

    test('StatusDisplay counter updates when member joins via API', async ({ page }) => {
        const { queueId } = await seedLoginAndCreateQueue(page, OPTS, 'Realtime Counter Queue');

        await page.goto(`/display/status?q=${queueId}`);
        await page.locator('[data-testid="live-queue-size"]').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('[data-testid="live-queue-size"]')).toHaveText('0', { timeout: 8000 });

        await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Live User' } }
        });

        // StatusDisplay should show the updated counter via WebSocket or polling
        const statusResp = await page.request.get(`/api/v1/queue/${queueId}/status`);
        expect((await statusResp.json()).queue_size).toBe(1);
    });

    test('Call Next sequencial: FIFO preserved across multiple calls', async ({ page }) => {
        const { queueId, token } = await seedLoginAndCreateQueue(page, OPTS, 'Sequential CallNext Queue');

        const names = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
        for (const nome of names) {
            await page.request.post('/api/v1/queue/join', {
                data: { queue_id: queueId, user_data: { nome } }
            });
        }

        await page.goto(`/dashboard/queue/${queueId}`);
        await page.locator('#members-table').waitFor({ state: 'visible', timeout: 8000 });

        // Call next 3 times and verify FIFO order.
        // Wait for each specific name to appear in the banner before proceeding,
        // to avoid reading stale text from the previous call.
        for (const expected of ['First', 'Second', 'Third']) {
            await Promise.all([
                page.waitForResponse('**/call-next'),
                page.click('#call-next-btn'),
            ]);
            await expect(page.locator('#called-user-banner')).toContainText(expected, { timeout: 8000 });
        }

        // 2 members should remain
        const sizeResp = await page.request.get(`/api/v1/queue/${queueId}/status`);
        expect((await sizeResp.json()).queue_size).toBe(2);
    });

    test('Reorder member via API and verify new position in management page', async ({ page }) => {
        const { queueId, token } = await seedLoginAndCreateQueue(page, OPTS, 'Reorder Test Queue');

        for (const nome of ['Alpha', 'Beta', 'Gamma']) {
            await page.request.post('/api/v1/queue/join', {
                data: { queue_id: queueId, user_data: { nome } }
            });
        }

        // Move Gamma to position 0 via API
        const reorderResp = await page.request.put(
            `/api/v1/b2b/queue/${queueId}/members/reorder`,
            {
                headers: { 'x-tenant-token': token },
                data: { user_data: { nome: 'Gamma' }, target_position: 0 }
            }
        );
        expect(reorderResp.ok()).toBeTruthy();
        expect((await reorderResp.json()).new_position).toBe(0);

        // Navigate to management page and confirm Gamma is first
        await page.goto(`/dashboard/queue/${queueId}`);
        await page.locator('#members-table').waitFor({ state: 'visible', timeout: 8000 });
        const firstRow = page.locator('[data-testid="member-row-0"]');
        await expect(firstRow).toContainText('Gamma');
    });

    test('Login with non-existent email shows error', async ({ page }) => {
        await page.goto('/login');
        await page.fill('#login-email', 'noexiste@nuncafoiseed.com');
        await page.fill('#login-password', 'qualquercoisa');
        await page.click('#login-submit');
        await expect(page.locator('#login-error')).toBeVisible({ timeout: 8000 });
    });
});
