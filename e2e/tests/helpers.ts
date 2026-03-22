import { expect, Page } from '@playwright/test';

export interface SeedOpts {
    tenantName: string;
    email: string;
    password: string;
}

export interface LoginAndQueueResult {
    queueId: string;
    token: string;
}

/**
 * Seeds a B2B tenant+user via the test endpoint.
 * Idempotent: wipes existing queues/redis keys if tenant already exists.
 */
export async function seedB2BUser(page: Page, opts: SeedOpts): Promise<void> {
    const resp = await page.request.post('/api/v1/test/seed-b2b', {
        data: { tenant_name: opts.tenantName, email: opts.email, password: opts.password }
    });
    expect(resp.ok()).toBeTruthy();
}

/**
 * Seeds, logs in, and creates a queue via the dashboard UI.
 * Returns the queueId extracted from the queue list item data-testid.
 */
export async function seedLoginAndCreateQueue(
    page: Page,
    opts: SeedOpts,
    queueNamePrefix: string,
    schemaFieldName: string = 'nome'
): Promise<LoginAndQueueResult> {
    await seedB2BUser(page, opts);

    const queueName = `${queueNamePrefix} ${Date.now()}`;
    await page.goto('/login');
    await page.fill('#login-email', opts.email);
    await page.fill('#login-password', opts.password);

    const [loginResp] = await Promise.all([
        page.waitForResponse('**/api/v1/auth/login'),
        page.click('#login-submit')
    ]);
    await page.waitForURL('**/dashboard');
    const token: string = (await loginResp.json()).access_token;

    await page.click('[data-testid="new-queue-btn"]');
    await page.fill('#queue-name', queueName);
    await page.fill('[data-testid="schema-field-name-0"]', schemaFieldName);
    await page.click('#create-queue-submit');
    await page.locator('#create-success').waitFor({ state: 'visible', timeout: 8000 });

    const queueItem = page.locator('.queue-item', { hasText: queueName }).first();
    await queueItem.waitFor({ state: 'visible', timeout: 8000 });
    const testId = await queueItem.getAttribute('data-testid') ?? '';
    const queueId = testId.replace('queue-item-', '');

    return { queueId, token };
}

/**
 * Seeds, logs in, and creates a queue with a rich form_schema via the API directly.
 * Returns the queueId.
 */
export async function seedLoginAndCreateRichQueue(
    page: Page,
    opts: SeedOpts,
    formSchema: object
): Promise<LoginAndQueueResult> {
    await seedB2BUser(page, opts);

    await page.goto('/login');
    await page.fill('#login-email', opts.email);
    await page.fill('#login-password', opts.password);

    const [loginResp] = await Promise.all([
        page.waitForResponse('**/api/v1/auth/login'),
        page.click('#login-submit')
    ]);
    await page.waitForURL('**/dashboard');
    const token: string = (await loginResp.json()).access_token;

    const createResp = await page.request.post('/api/v1/b2b/queues', {
        headers: { 'x-tenant-token': token },
        data: { name: `Rich Queue ${Date.now()}`, form_schema: formSchema }
    });
    if (!createResp.ok()) {
        throw new Error(`Create queue failed: ${createResp.status()} — ${await createResp.text()}`);
    }
    const queueId: string = (await createResp.json()).id;

    return { queueId, token };
}
