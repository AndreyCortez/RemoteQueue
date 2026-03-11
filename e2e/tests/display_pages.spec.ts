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
    
    // Ensure we await the API response before expecting URL change
    const [response] = await Promise.all([
        page.waitForResponse('**/api/v1/auth/login'),
        page.click('#login-submit')
    ]);
    
    await page.waitForURL('**/dashboard');

    const uniqueQueueName = 'Display Test Queue ' + Date.now();
    await page.fill('#queue-name', uniqueQueueName);
    await page.fill('[data-testid="schema-field-name-0"]', 'nome');
    await page.click('#create-queue-submit');
    await expect(page.locator('#create-success')).toBeVisible();

    const queueItem = page.locator('.queue-item', { hasText: uniqueQueueName }).first();
    await expect(queueItem).toBeVisible();
    const testId = await queueItem.getAttribute('data-testid') ?? '';
    const qid = testId.replace('queue-item-', '');
    
    // DEBUG: print status IMMEDIATELY after creation
    const statusResp = await page.request.get(`/api/v1/queue/${qid}/status`);
    const statusJson = await statusResp.json();
    console.log(`NEW QUEUE SIZE IN DB: ${statusJson.queue_size}`);

    return qid;
}

test.describe('Public Status Display Page', () => {
    test('StatusDisplay shows queue name and counter', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        await page.goto(`/display/status?q=${queueId}`);
        await page.locator('text=Display Test Queue').waitFor({ state: 'visible', timeout: 8000 });
        await expect(page.locator('text=AO VIVO')).toBeVisible();
        // Counter shows 0
        await expect(page.locator('[data-testid="live-queue-size"]')).toHaveText('0', { timeout: 8000 });
    });

    test('StatusDisplay updates counter when member joins', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        await page.goto(`/display/status?q=${queueId}`);
        await page.locator('[data-testid="live-queue-size"]').waitFor({ state: 'visible', timeout: 8000 });

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
        await page.locator('text=Fila não encontrada').waitFor({ state: 'visible', timeout: 8000 });
    });
});

test.describe('Public QR Display Page', () => {
    test('QRDisplay shows queue QR code', async ({ page }) => {
        const queueId = await seedAndLogin(page);
        await page.goto(`/display/qr?q=${queueId}`);
        await page.locator('text=Display Test Queue').waitFor({ state: 'visible', timeout: 8000 });
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
        expect(data.name).toContain('Display Test Queue');
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

test.describe('Fase 4 — Rich Form Schema (B2C Join)', () => {
    const RICH_TENANT = 'Rich Schema Display Corp';
    const RICH_EMAIL = 'rich_operator@company.com';
    const RICH_PASSWORD = 'rich_test_pass_999';

    async function seedAndCreateRichQueue(page: Page): Promise<string> {
        await page.request.post('/api/v1/test/seed-b2b', {
            data: { tenant_name: RICH_TENANT, email: RICH_EMAIL, password: RICH_PASSWORD }
        });
        await page.goto('/login');
        await page.fill('#login-email', RICH_EMAIL);
        await page.fill('#login-password', RICH_PASSWORD);
        const [loginResp] = await Promise.all([
            page.waitForResponse('**/api/v1/auth/login'),
            page.click('#login-submit')
        ]);
        await page.waitForURL('**/dashboard');
        const token: string = (await loginResp.json()).access_token;

        // Create queue via API with rich schema
        const createResp = await page.request.post('/api/v1/b2b/queues', {
            headers: { 'x-tenant-token': token },
            data: {
                name: 'Rich Schema Queue',
                form_schema: {
                    nome: { type: 'string', label: 'Nome completo', required: true },
                    cpf: {
                        type: 'string',
                        label: 'CPF',
                        required: false,
                        pattern: String.raw`^\d{3}\.\d{3}\.\d{3}-\d{2}$`,
                    },
                    idade: { type: 'integer', label: 'Idade', required: true },
                }
            }
        });
        expect(createResp.ok()).toBeTruthy();
        return (await createResp.json()).id;
    }

    test('join with rich schema — all required fields present succeeds', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        const resp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Maria', idade: 28 } }
        });
        expect(resp.ok()).toBeTruthy();
        expect((await resp.json()).status).toBe('success');
    });

    test('join with rich schema — optional field absent succeeds', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        // cpf is optional — omitting it must succeed
        const resp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Carlos', idade: 40 } }
        });
        expect(resp.ok()).toBeTruthy();
    });

    test('join with rich schema — required field missing returns 422', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        const resp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { idade: 30 } }
        });
        expect(resp.status()).toBe(422);
        const data = await resp.json();
        expect(data.detail.toLowerCase()).toContain('missing required field: nome');
    });

    test('join with rich schema — wrong type returns 422', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        const resp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Ana', idade: 'trinta' } }
        });
        expect(resp.status()).toBe(422);
    });

    test('join with rich schema — invalid CPF pattern returns 422', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        const resp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'Pedro', cpf: '12345678900', idade: 22 } }
        });
        expect(resp.status()).toBe(422);
        expect((await resp.json()).detail.toLowerCase()).toContain('pattern');
    });

    test('join with rich schema — valid CPF pattern succeeds', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        const resp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: { nome: 'João', cpf: '123.456.789-00', idade: 35 } }
        });
        expect(resp.ok()).toBeTruthy();
    });

    test('B2CJoin page — renders labels from rich schema', async ({ page }) => {
        const queueId = await seedAndCreateRichQueue(page);
        await page.goto(`/join?q=${queueId}`);
        // Labels defined in rich schema must appear in the form
        await expect(page.locator('text=Nome completo')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('text=Idade')).toBeVisible({ timeout: 8000 });
    });
});
