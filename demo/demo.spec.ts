/**
 * Remote Queue — Product Demo Script
 *
 * Automated walkthrough of every core flow, running in a visible browser.
 * An HTML overlay narrates each scene so the viewer understands what's happening.
 *
 * Prerequisites:
 *   docker compose up -d   (backend :8001, frontend :3000, postgres, redis)
 *   npx playwright install chromium
 *
 * Run:
 *   cd demo && npx playwright test
 */
import { test, expect, Page } from '@playwright/test';

// ─── Demo credentials ───────────────────────────────────────────
const DEMO_EMAIL = 'demo_operator@clinica.com';
const DEMO_PASSWORD = 'demo_pass_2024';
const DEMO_TENANT = 'Clínica São Paulo';
const QUEUE_NAME = 'Recepção Principal';

// ─── Timing helpers ─────────────────────────────────────────────
const PAUSE_SHORT  = 1_500;
const PAUSE_MEDIUM = 3_000;
const PAUSE_LONG   = 5_000;
const PAUSE_SCENE  = 4_000;

// ─── Logging helper ─────────────────────────────────────────────

function log(step: string, detail?: string) {
    const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msg = detail ? `[${ts}] ✦ ${step} — ${detail}` : `[${ts}] ✦ ${step}`;
    console.log(msg);
}

// ─── Overlay narrator ───────────────────────────────────────────

async function showNarration(page: Page, scene: string, description: string, options?: { duration?: number }) {
    await page.evaluate(({ scene, description }) => {
        document.getElementById('demo-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'demo-overlay';
        overlay.innerHTML = `
            <div style="
                position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
                background: linear-gradient(135deg, rgba(10, 14, 26, 0.95), rgba(99, 102, 241, 0.9));
                color: #f1f5f9;
                padding: 20px 32px;
                font-family: 'Inter', -apple-system, sans-serif;
                box-shadow: 0 4px 30px rgba(0,0,0,0.4);
                backdrop-filter: blur(8px);
                border-bottom: 2px solid rgba(99, 102, 241, 0.6);
                animation: demo-slide-in 0.4s ease;
            ">
                <style>
                    @keyframes demo-slide-in {
                        from { transform: translateY(-100%); opacity: 0; }
                        to   { transform: translateY(0);     opacity: 1; }
                    }
                    @keyframes demo-pulse-dot {
                        0%, 100% { opacity: 1; }
                        50%      { opacity: 0.4; }
                    }
                </style>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
                    <span style="
                        display: inline-block; width: 10px; height: 10px;
                        border-radius: 50%; background: #ef4444;
                        animation: demo-pulse-dot 1.5s ease-in-out infinite;
                    "></span>
                    <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8;">
                        DEMO AO VIVO
                    </span>
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">
                    ${scene}
                </div>
                <div style="font-size: 0.95rem; color: #cbd5e1; line-height: 1.4;">
                    ${description}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }, { scene, description });

    await page.waitForTimeout(options?.duration ?? PAUSE_SCENE);
}

async function clearNarration(page: Page) {
    await page.evaluate(() => {
        document.getElementById('demo-overlay')?.remove();
    });
}

/** Slow human-like typing */
async function slowType(page: Page, selector: string, text: string) {
    await page.click(selector);
    await page.type(selector, text, { delay: 70 });
}

/**
 * Ensures we're on the dashboard with a valid session.
 * If redirected to login or token is missing, re-logs in.
 */
async function ensureAuthenticated(page: Page) {
    const token = await page.evaluate(() => localStorage.getItem('rq_access_token'));
    log('AUTH', `Token in localStorage: ${token ? token.substring(0, 20) + '...' : 'NULL'}`);

    if (!token) {
        log('AUTH', 'No token — performing fresh login');
        await doLogin(page);
        return;
    }

    await page.goto('/dashboard');
    await page.waitForTimeout(2_000);

    if (page.url().includes('/login')) {
        log('AUTH', 'Redirected to login — token invalid, re-logging in');
        await doLogin(page);
    } else {
        log('AUTH', `Authenticated — on ${page.url()}`);
    }
}

async function doLogin(page: Page) {
    await page.goto('/login');
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: 5_000 });
    await page.fill('#login-email', DEMO_EMAIL);
    await page.fill('#login-password', DEMO_PASSWORD);
    await Promise.all([
        page.waitForURL('**/dashboard', { timeout: 15_000 }),
        page.click('#login-submit'),
    ]);
    log('AUTH', `Login done — URL: ${page.url()}`);
    await page.waitForTimeout(1_000);
}

// ─── Single long test = the entire demo ─────────────────────────

test('Remote Queue — Full Product Demo', async ({ page, context }) => {

    // ════════════════════════════════════════════════════════
    // SETUP: Seed demo user via API
    // ════════════════════════════════════════════════════════
    log('SETUP', 'Seeding demo user via /api/v1/test/seed-b2b ...');
    const seedResp = await page.request.post('/api/v1/test/seed-b2b', {
        data: { tenant_name: DEMO_TENANT, email: DEMO_EMAIL, password: DEMO_PASSWORD }
    });
    const seedStatus = seedResp.status();
    const seedBody = await seedResp.json().catch(() => ({}));
    log('SETUP', `Seed response: ${seedStatus} — ${JSON.stringify(seedBody)}`);
    if (!seedResp.ok()) {
        throw new Error(`Seed failed: ${seedStatus} — ${JSON.stringify(seedBody)}`);
    }

    // ════════════════════════════════════════════════════════
    // CENA 0 — Splash
    // ════════════════════════════════════════════════════════
    log('CENA 0', 'Navigating to / (splash)');
    await page.goto('/');
    log('CENA 0', `Page loaded — URL: ${page.url()} — Title: ${await page.title()}`);
    await showNarration(page,
        '🎬 Remote Queue — Demonstração do Produto',
        'Sistema completo de gestão de filas: painel B2B para operadores, entrada B2C via QR Code, displays em tempo real para TVs e totems.',
        { duration: PAUSE_LONG }
    );

    // ════════════════════════════════════════════════════════
    // CENA 1 — Login B2B
    // ════════════════════════════════════════════════════════
    log('CENA 1', 'Navigating to /login');
    await page.goto('/login');
    log('CENA 1', `Page loaded — URL: ${page.url()}`);

    // Check login form elements exist
    const emailField = page.locator('#login-email');
    const passField = page.locator('#login-password');
    const submitBtn = page.locator('#login-submit');
    log('CENA 1', `Email field visible: ${await emailField.isVisible()}`);
    log('CENA 1', `Password field visible: ${await passField.isVisible()}`);
    log('CENA 1', `Submit btn visible: ${await submitBtn.isVisible()}`);

    await showNarration(page,
        '🔐 Cena 1: Login do Operador',
        'O operador da clínica acessa o portal B2B com email e senha.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    log('CENA 1', 'Typing email...');
    await slowType(page, '#login-email', DEMO_EMAIL);
    await page.waitForTimeout(400);
    log('CENA 1', 'Typing password...');
    await slowType(page, '#login-password', DEMO_PASSWORD);
    await page.waitForTimeout(600);

    log('CENA 1', 'Clicking Sign In...');
    await Promise.all([
        page.waitForURL('**/dashboard', { timeout: 15_000 }),
        page.click('#login-submit'),
    ]);
    log('CENA 1', `Login success — URL: ${page.url()}`);
    await page.waitForTimeout(PAUSE_SHORT);

    // ════════════════════════════════════════════════════════
    // CENA 2 — Criar fila
    // ════════════════════════════════════════════════════════
    log('CENA 2', `Current URL before scene: ${page.url()}`);
    // Verify we're actually on dashboard — if redirected to login, we need to re-login
    if (page.url().includes('/login')) {
        log('CENA 2', 'WARNING: Redirected back to login! Auth state lost. Re-logging in...');
        await slowType(page, '#login-email', DEMO_EMAIL);
        await slowType(page, '#login-password', DEMO_PASSWORD);
        await Promise.all([
            page.waitForURL('**/dashboard', { timeout: 15_000 }),
            page.click('#login-submit'),
        ]);
        log('CENA 2', `Re-login success — URL: ${page.url()}`);
        await page.waitForTimeout(PAUSE_SHORT);
    }

    // Verify dashboard elements are present
    const queueNameField = page.locator('#queue-name');
    await queueNameField.waitFor({ state: 'visible', timeout: 10_000 }).catch(async () => {
        log('CENA 2', `ERROR: #queue-name not visible after 10s. Current URL: ${page.url()}`);
        const bodyText = await page.locator('body').innerText();
        log('CENA 2', `Page body: ${bodyText.substring(0, 600)}`);
        throw new Error('Dashboard not loaded — #queue-name not visible');
    });

    log('CENA 2', 'Creating queue...');
    await showNarration(page,
        '📋 Cena 2: Criação de uma Nova Fila',
        'O operador define o nome da fila e quais campos o cliente precisa preencher (nome, CPF, etc).',
        { duration: PAUSE_SCENE }
    );
    await clearNarration(page);

    // Check form elements
    log('CENA 2', `#queue-name visible: ${await page.locator('#queue-name').isVisible()}`);
    log('CENA 2', `schema-field-name-0 visible: ${await page.locator('[data-testid="schema-field-name-0"]').isVisible()}`);

    await slowType(page, '#queue-name', QUEUE_NAME);
    await page.waitForTimeout(400);

    await slowType(page, '[data-testid="schema-field-name-0"]', 'nome');
    await page.waitForTimeout(400);

    log('CENA 2', 'Adding second field (cpf)...');
    await page.click('#add-field-btn');
    await page.waitForTimeout(300);
    await slowType(page, '[data-testid="schema-field-name-1"]', 'cpf');
    await page.waitForTimeout(400);

    // NOTE: We do NOT enable QR rotation here so B2C join works with plain URLs.
    // QR rotation is demonstrated in Scene 8 (Settings).
    log('CENA 2', 'Skipping QR rotation at creation (will demo in Settings scene)');

    log('CENA 2', 'Submitting queue creation...');
    await page.click('#create-queue-submit');

    log('CENA 2', 'Waiting for #create-success ...');
    await page.locator('#create-success').waitFor({ state: 'visible', timeout: 8_000 });
    log('CENA 2', 'Queue created successfully!');

    await showNarration(page,
        '✅ Fila criada com sucesso!',
        `A fila "${QUEUE_NAME}" aparece na lista com os campos definidos.`,
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    // Get queue ID from list
    log('CENA 2', 'Extracting queue ID from list...');
    const queueItem = page.locator('.queue-item', { hasText: QUEUE_NAME }).first();
    await queueItem.waitFor({ state: 'visible', timeout: 8_000 });
    const testId = await queueItem.getAttribute('data-testid') ?? '';
    const queueId = testId.replace('queue-item-', '');
    log('CENA 2', `Queue ID: ${queueId}`);

    if (!queueId) {
        log('CENA 2', 'ERROR: queueId is empty! Dumping page content...');
        const bodyText = await page.locator('body').innerText();
        log('CENA 2', `Page body (first 500 chars): ${bodyText.substring(0, 500)}`);
        throw new Error('Failed to extract queueId from DOM');
    }

    // ════════════════════════════════════════════════════════
    // CENA 3 — QR Code Modal
    // ════════════════════════════════════════════════════════
    log('CENA 3', 'Opening QR Code modal...');
    await showNarration(page,
        '📱 Cena 3: QR Code da Fila',
        'O operador gera o QR Code para imprimir ou exibir no totem.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    const qrBtn = page.locator(`[data-testid="qr-btn-${queueId}"]`);
    log('CENA 3', `QR button visible: ${await qrBtn.isVisible()}`);
    await qrBtn.click();
    log('CENA 3', 'Waiting for #qr-code-img ...');
    await page.locator('#qr-code-img').waitFor({ state: 'visible', timeout: 8_000 });
    log('CENA 3', 'QR Code modal visible!');
    await page.waitForTimeout(PAUSE_LONG);

    await page.locator('text=Close').click();
    log('CENA 3', 'Modal closed');
    await page.waitForTimeout(PAUSE_SHORT);

    // ════════════════════════════════════════════════════════
    // CENA 4 — QR Display (Kiosk / Totem)
    // ════════════════════════════════════════════════════════
    log('CENA 4', `Opening kiosk display: /display/qr?q=${queueId}`);
    const kioskPage = await context.newPage();
    await kioskPage.goto(`/display/qr?q=${queueId}`);
    await kioskPage.waitForTimeout(2_000);
    log('CENA 4', `Kiosk page URL: ${kioskPage.url()}`);
    log('CENA 4', `Kiosk page title: ${await kioskPage.title()}`);

    await showNarration(kioskPage,
        '🖥️ Cena 4: Tela do Totem (Kiosk QR Display)',
        'Essa tela fica em um tablet ou totem na entrada do estabelecimento. Exibe o QR Code grande e o contador em tempo real de pessoas na fila.',
        { duration: PAUSE_LONG }
    );
    await clearNarration(kioskPage);
    await kioskPage.waitForTimeout(PAUSE_MEDIUM);

    // ════════════════════════════════════════════════════════
    // CENA 5 — Status Display (TV)
    // ════════════════════════════════════════════════════════
    log('CENA 5', `Opening TV display: /display/status?q=${queueId}`);
    const tvPage = await context.newPage();
    await tvPage.goto(`/display/status?q=${queueId}`);
    await tvPage.waitForTimeout(2_000);
    log('CENA 5', `TV page URL: ${tvPage.url()}`);

    // Check for live-queue-size element
    const liveSize = tvPage.locator('[data-testid="live-queue-size"]');
    log('CENA 5', `live-queue-size visible: ${await liveSize.isVisible({ timeout: 5_000 }).catch(() => false)}`);

    await showNarration(tvPage,
        '📺 Cena 5: Tela da TV (Status Display)',
        'Essa tela fica em uma TV na sala de espera. Mostra quem está sendo chamado, quantas pessoas estão na fila e o histórico das últimas chamadas. Tudo em tempo real.',
        { duration: PAUSE_LONG }
    );
    await clearNarration(tvPage);
    await tvPage.waitForTimeout(PAUSE_MEDIUM);

    // ════════════════════════════════════════════════════════
    // CENA 6 — Clientes entram na fila (B2C)
    // ════════════════════════════════════════════════════════
    await page.bringToFront();
    log('CENA 6', 'Starting B2C client join flow');
    await showNarration(page,
        '👤 Cena 6: Clientes Entram na Fila',
        'Clientes escaneiam o QR Code com o celular e preenchem o formulário. Vamos simular a entrada de 5 clientes.',
        { duration: PAUSE_SCENE }
    );
    await clearNarration(page);

    // Client 1 — visual form fill
    log('CENA 6', `Opening join page: /join?q=${queueId}`);
    const clientPage = await context.newPage();
    await clientPage.goto(`/join?q=${queueId}`);
    log('CENA 6', `Join page URL: ${clientPage.url()}`);

    // Wait for form to load
    log('CENA 6', 'Waiting for #field-nome ...');
    const fieldNome = clientPage.locator('#field-nome');
    const fieldNomeVisible = await fieldNome.isVisible({ timeout: 8_000 }).catch(() => false);
    log('CENA 6', `#field-nome visible: ${fieldNomeVisible}`);

    if (!fieldNomeVisible) {
        log('CENA 6', 'ERROR: Form fields not visible. Dumping page...');
        const bodyText = await clientPage.locator('body').innerText();
        log('CENA 6', `Join page body (first 500 chars): ${bodyText.substring(0, 500)}`);
        // Also check for error messages
        const errorVisible = await clientPage.locator('.alert-error').isVisible().catch(() => false);
        log('CENA 6', `Error alert visible: ${errorVisible}`);
        if (errorVisible) {
            const errorText = await clientPage.locator('.alert-error').innerText();
            log('CENA 6', `Error text: ${errorText}`);
        }
        throw new Error('Join form did not render — #field-nome not visible');
    }

    // Check for cpf field too
    const fieldCpf = clientPage.locator('#field-cpf');
    log('CENA 6', `#field-cpf visible: ${await fieldCpf.isVisible()}`);

    await showNarration(clientPage,
        '👤 Cliente 1: Maria Silva',
        'A cliente escaneia o QR, vê o nome da fila e preenche seus dados.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(clientPage);

    log('CENA 6', 'Filling Client 1 form (Maria Silva)...');
    await slowType(clientPage, '#field-nome', 'Maria Silva');
    await slowType(clientPage, '#field-cpf', '123.456.789-00');
    await clientPage.waitForTimeout(600);

    log('CENA 6', 'Submitting join form...');
    await clientPage.click('#join-submit');

    log('CENA 6', 'Waiting for "in line" text...');
    const inLineVisible = await clientPage.locator('text=in line').isVisible({ timeout: 8_000 }).catch(() => false);
    log('CENA 6', `"in line" visible: ${inLineVisible}`);

    if (!inLineVisible) {
        log('CENA 6', 'ERROR: Join did not succeed. Dumping page...');
        const bodyText = await clientPage.locator('body').innerText();
        log('CENA 6', `Client page body: ${bodyText.substring(0, 500)}`);
        throw new Error('Client join failed — "in line" text not visible');
    }

    await showNarration(clientPage,
        '🎟️ Maria está na fila!',
        'Ela vê sua posição (#1) em tempo real. A tela atualiza automaticamente quando alguém é chamado.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(clientPage);

    // Clients 2-5 via API (fast)
    log('CENA 6', 'Adding clients 2-5 via API...');
    const clients = [
        { nome: 'João Santos', cpf: '987.654.321-00' },
        { nome: 'Ana Oliveira', cpf: '111.222.333-44' },
        { nome: 'Carlos Pereira', cpf: '555.666.777-88' },
        { nome: 'Lucia Fernandes', cpf: '999.888.777-66' },
    ];
    for (const c of clients) {
        const joinResp = await page.request.post('/api/v1/queue/join', {
            data: { queue_id: queueId, user_data: c }
        });
        log('CENA 6', `Joined ${c.nome}: ${joinResp.status()} — ${JSON.stringify(await joinResp.json().catch(() => ({})))}`);
        await page.waitForTimeout(400);
    }

    // Show kiosk counter updating
    log('CENA 6', 'Checking kiosk counter...');
    await kioskPage.bringToFront();
    await kioskPage.waitForTimeout(2_000);
    await showNarration(kioskPage,
        '📊 Contador Atualizado em Tempo Real',
        'O totem agora mostra "5 pessoas" na fila. Atualiza automaticamente via WebSocket.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(kioskPage);

    // ════════════════════════════════════════════════════════
    // CENA 7 — Gestão da Fila (Operador)
    // ════════════════════════════════════════════════════════
    await page.bringToFront();
    log('CENA 7', 'Ensuring authenticated before queue management...');
    await ensureAuthenticated(page);
    log('CENA 7', `Dashboard URL: ${page.url()}`);

    await showNarration(page,
        '⚙️ Cena 7: Gestão da Fila pelo Operador',
        'O operador clica na fila para gerenciá-la: chamar próximo, reordenar, remover.',
        { duration: PAUSE_SCENE }
    );
    await clearNarration(page);

    log('CENA 7', 'Clicking queue item to manage...');
    const mgmtItem = page.locator('.queue-item', { hasText: QUEUE_NAME }).first();
    const mgmtItemVisible = await mgmtItem.isVisible({ timeout: 5_000 }).catch(() => false);
    log('CENA 7', `Queue item visible: ${mgmtItemVisible}`);
    // Must click the name div specifically — the buttons area has stopPropagation

    if (!mgmtItemVisible) {
        log('CENA 7', 'ERROR: Queue item not visible on dashboard');
        const bodyText = await page.locator('body').innerText();
        log('CENA 7', `Dashboard body: ${bodyText.substring(0, 500)}`);
        throw new Error('Queue item not found on dashboard');
    }

    await mgmtItem.locator('.queue-item-name').click();
    await page.waitForURL('**/dashboard/queue/**', { timeout: 10_000 });
    log('CENA 7', `Management page URL: ${page.url()}`);

    log('CENA 7', 'Waiting for #members-table ...');
    const tableVisible = await page.locator('#members-table').isVisible({ timeout: 8_000 }).catch(() => false);
    log('CENA 7', `#members-table visible: ${tableVisible}`);

    if (!tableVisible) {
        log('CENA 7', 'ERROR: Members table not visible');
        const bodyText = await page.locator('body').innerText();
        log('CENA 7', `Management page body: ${bodyText.substring(0, 500)}`);
        // Check if page shows empty queue or error
        const emptyQueue = await page.locator('text=Queue is empty').isVisible().catch(() => false);
        log('CENA 7', `"Queue is empty" visible: ${emptyQueue}`);
        throw new Error('Members table not visible on management page');
    }

    // Count visible rows
    const rowCount = await page.locator('[data-testid^="member-row-"]').count();
    log('CENA 7', `Visible member rows: ${rowCount}`);

    await page.waitForTimeout(PAUSE_SHORT);
    await showNarration(page,
        '📋 Tabela de Membros',
        `${rowCount} clientes na fila. O operador vê nome, CPF, horário de entrada e pode reordenar ou remover.`,
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    // Call Next #1
    log('CENA 7', 'Calling next (first call)...');
    await showNarration(page,
        '▶ Chamando Próximo: Call Next',
        'O operador chama o próximo da fila. O primeiro cliente (Maria Silva) será chamado.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    const callNextBtn = page.locator('#call-next-btn');
    log('CENA 7', `Call Next btn visible: ${await callNextBtn.isVisible()}, disabled: ${await callNextBtn.isDisabled()}`);
    await callNextBtn.click();

    log('CENA 7', 'Waiting for #called-user-banner ...');
    const bannerVisible = await page.locator('#called-user-banner').isVisible({ timeout: 8_000 }).catch(() => false);
    log('CENA 7', `Banner visible: ${bannerVisible}`);
    if (bannerVisible) {
        const bannerText = await page.locator('#called-user-banner').innerText();
        log('CENA 7', `Banner text: ${bannerText.substring(0, 200)}`);
    }
    await page.waitForTimeout(PAUSE_MEDIUM);

    await showNarration(page,
        '✅ Maria Silva foi chamada!',
        'O banner verde mostra os dados da pessoa chamada. Na TV da sala de espera, o nome aparece em destaque.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    // Show TV reacting
    log('CENA 7', 'Checking TV display reaction...');
    await tvPage.bringToFront();
    await tvPage.waitForTimeout(PAUSE_MEDIUM);
    await showNarration(tvPage,
        '📺 TV Atualizada em Tempo Real',
        'A TV mostra "Chamando agora: Maria Silva" com animação flash verde. O contador atualizou.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(tvPage);

    // Show client's phone — "It's your turn!"
    log('CENA 7', "Checking Maria's phone (called status)...");
    await clientPage.bringToFront();
    await clientPage.waitForTimeout(2_000);
    const calledVisible = await clientPage.locator('text=your turn').isVisible().catch(() => false);
    log('CENA 7', `"your turn" visible on client: ${calledVisible}`);
    await showNarration(clientPage,
        '🎉 Celular da Maria',
        'No celular da Maria, a tela mudou para "It\'s your turn!" — ela sabe que deve ir ao guichê.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(clientPage);

    // Call Next #2
    log('CENA 7', 'Calling next (second call)...');
    await page.bringToFront();
    await page.click('#call-next-btn');
    await page.waitForTimeout(PAUSE_SHORT);

    // Reorder
    log('CENA 7', 'Attempting reorder (move-up-2)...');
    await showNarration(page,
        '🔄 Reordenação Manual',
        'O operador pode alterar a ordem da fila. Vamos mover o último paciente para cima.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    const moveUpBtn = page.locator('[data-testid="move-up-2"]');
    const moveUpVisible = await moveUpBtn.isVisible().catch(() => false);
    log('CENA 7', `move-up-2 visible: ${moveUpVisible}`);
    if (moveUpVisible) {
        await moveUpBtn.click();
        await page.waitForTimeout(PAUSE_SHORT);
        log('CENA 7', 'Reorder done');
    } else {
        log('CENA 7', 'SKIP: move-up-2 not visible, fewer members than expected');
    }

    // Remove a member
    log('CENA 7', 'Attempting remove (remove-btn-0)...');
    await showNarration(page,
        '🗑️ Remoção Manual',
        'O operador pode remover um cliente específico da fila (ex: cliente desistiu).',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    const removeBtn = page.locator('[data-testid="remove-btn-0"]');
    const removeBtnVisible = await removeBtn.isVisible().catch(() => false);
    log('CENA 7', `remove-btn-0 visible: ${removeBtnVisible}`);
    if (removeBtnVisible) {
        await removeBtn.click();
        await page.waitForTimeout(PAUSE_SHORT);
        log('CENA 7', 'Remove done');
    }

    // ════════════════════════════════════════════════════════
    // CENA 8 — Settings (QR Rotation)
    // ════════════════════════════════════════════════════════
    log('CENA 8', 'Opening settings...');
    await showNarration(page,
        '⚙️ Cena 8: Configurações da Fila',
        'O operador pode ajustar as configurações anti-fraude (rotação de QR Code) a qualquer momento.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    const settingsBtn = page.locator('text=Settings');
    log('CENA 8', `Settings btn visible: ${await settingsBtn.isVisible()}`);
    await settingsBtn.click();
    await page.waitForTimeout(PAUSE_SHORT);

    await showNarration(page,
        '🔄 QR Code Rotativo (Anti-Fraude)',
        'Quando ativado, o QR Code muda periodicamente. Isso impede que pessoas compartilhem o link e entrem na fila sem estar no local.',
        { duration: PAUSE_LONG }
    );
    await clearNarration(page);

    log('CENA 8', 'Closing settings...');
    await page.locator('text=Cancel').click();
    await page.waitForTimeout(800);

    // ════════════════════════════════════════════════════════
    // CENA 9 — Clear All
    // ════════════════════════════════════════════════════════
    log('CENA 9', 'Clear all members...');
    await showNarration(page,
        '🧹 Cena 9: Limpar Fila',
        'No final do expediente, o operador pode limpar toda a fila de uma vez.',
        { duration: PAUSE_MEDIUM }
    );
    await clearNarration(page);

    const clearBtn = page.locator('#clear-all-btn');
    const clearDisabled = await clearBtn.isDisabled();
    log('CENA 9', `Clear All disabled: ${clearDisabled}`);

    if (!clearDisabled) {
        page.on('dialog', dialog => {
            log('CENA 9', `Dialog appeared: "${dialog.message()}" — accepting`);
            dialog.accept();
        });
        await clearBtn.click();
        log('CENA 9', 'Waiting for "Queue is empty" ...');
        const emptyVisible = await page.locator('text=Queue is empty').isVisible({ timeout: 8_000 }).catch(() => false);
        log('CENA 9', `"Queue is empty" visible: ${emptyVisible}`);
    } else {
        log('CENA 9', 'Queue already empty, skipping clear');
    }
    await page.waitForTimeout(PAUSE_SHORT);

    // ════════════════════════════════════════════════════════
    // CENA 10 — Encerramento
    // ════════════════════════════════════════════════════════
    log('CENA 10', 'Final scene — demo summary');
    await showNarration(page,
        '🎬 Demo Completa — Remote Queue',
        [
            'Fluxos demonstrados:',
            '• Login B2B e criação de fila com schema customizado',
            '• QR Code com rotação anti-fraude',
            '• Tela de totem (kiosk) e TV (status display) em tempo real',
            '• Entrada de clientes via QR Code (B2C)',
            '• Gestão: chamar próximo, reordenar, remover, limpar',
            '• Atualizações em tempo real via WebSocket em todas as telas',
        ].join('<br>'),
        { duration: 10_000 }
    );

    log('DONE', 'Demo finished successfully!');

    // Close extra pages
    await clientPage.close();
    await kioskPage.close();
    await tvPage.close();
});
