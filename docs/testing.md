---
title: Guia de Testes (E2E e Unitários)
description: Diretrizes de testes de ponta a ponta (Playwright) e testes unitários de API/Banco de dados (Pytest).
tags: [testing, e2e, unit-tests, playwright, pytest]
---

# Remote Queue SaaS — Guia de Testes

Garantir a estabilidade da aplicação em tempo real exige duas camadas fundamentais de testes: **Unitários** (cobrindo lógica de estado e banco) e **E2E** (cobrindo a visualização no navegador e concorrência).

---

## 1. Testes Unitários (Pytest)

Os testes unitários e de integração validam as conexões de banco de dados (PostgreSQL/Redis), a injeção de dependências e os retornos dos endpoints.

### Estrutura

```
tests/
  conftest.py                 # SQLite in-memory + FakeRedis fixtures
  api/
    test_auth.py              # Login B2B, JWT, credenciais inválidas (4 testes)
    test_tenant_setup.py      # CRUD de filas, IDOR guard, QR code (7 testes)
    test_queue.py             # B2C join, validação de schema simples e rico, QR rotativo (12 testes)
    test_queue_management.py  # Chamar próximo, remover, reordenar, limpar, WebSocket broadcast (10 testes)
    test_test_seed.py         # Seed endpoint: create, idempotente, wipe queues/redis, produção (5 testes)
    test_websockets.py        # Conexão WebSocket, broadcast (2 testes)
  database/
    test_postgres.py          # Sessão SQLAlchemy (1 teste)
    test_redis.py             # QueueManager ZSET operations (4 testes)
```

### Executando Localmente

```bash
# Com PATH e PYTHONPATH ajustados (sem Docker)
export PATH="$HOME/.local/bin:$PATH"
PYTHONPATH=/home/wsl/RemoteQueue pytest tests/ --cov=api --cov-report=term-missing -q

# Dentro do container Docker
docker compose exec backend pytest tests/ --cov=api
```

### Cobertura Atual

```
45 testes passando — 0 falhas — 91% cobertura global

api/config.py                  100%
api/database/models.py          95%   (linhas 11-12: __repr__ ou campo auxiliar)
api/database/postgres.py       100%
api/database/redis.py           74%   (linhas 95-124: reorder_member — lógica complexa de reposicionamento)
api/dependencies/security.py    86%   (linhas 20-21, 32: branches de erro de JWT)
api/dependencies/websockets.py  92%   (linhas 31-33: broadcast com lista vazia)
api/logging_config.py           97%   (linha 37: branch de configuração)
api/main.py                     94%   (linha 25: startup event)
api/routers/auth.py            100%
api/routers/queue.py            88%   (linhas 96, 120, 141, 157-166, 177: qrcode-public + edge cases)
api/routers/queue_management.py 92%   (linhas 101-108: reorder endpoint)
api/routers/tenant_setup.py     99%   (linha 77: branch marginal)
api/routers/test_seed.py       100%
```

### Padrões

- **SQLite in-memory + StaticPool**: `conftest.py` força `settings.database_url = "sqlite:///:memory:"` e cria/dropa tabelas em cada teste via `Base.metadata.create_all` (independente do Alembic).
- **FakeRedis via dependency_overrides**: Para routers que usam `get_redis_client` como `Depends`, sobrescreve com `fakeredis.FakeRedis`.
- **FakeRedis via `unittest.mock.patch`**: Para `test_seed.py`, que chama `get_redis_client()` diretamente (não via `Depends`) — `dependency_overrides` não alcança chamadas diretas.
- **Isolamento por fixture**: `autouse=True` no `reset_db` garante banco limpo entre cada teste.

### Divergência SQLite vs PostgreSQL

O SQLite em modo `in-memory` **não valida foreign key constraints** a menos que `PRAGMA foreign_keys = ON` seja executado. Isso significa que bugs de integridade referencial passam nos testes unitários mas explodem em PostgreSQL com `ForeignKeyViolation`.

**Caso real encontrado**: O endpoint `seed-b2b` deletava `queue_configs` sem antes deletar os `queue_entries` filhos. Passou em todos os 45 testes unitários. Causou falha em 31 dos 38 testes E2E contra PostgreSQL real.

**Padrão defensivo adotado**: sempre deletar filhos antes dos pais.

```python
# FK: queue_entries.queue_id → queue_configs.id
db.query(QueueEntry).filter(QueueEntry.tenant_id == tenant_id).delete()
db.query(QueueConfig).filter(QueueConfig.tenant_id == tenant_id).delete()
db.commit()
```

---

## 2. Testes End-to-End (E2E / Playwright)

Os testes E2E simulam o fluxo do usuário em uma instância completa (Frontend Nginx + Backend API + Redis + Postgres). São **38 testes** distribuídos em 4 suites.

### Estrutura

```
e2e/
  playwright.config.ts        # Configuração: baseURL, retries, workers, trace
  tests/
    b2b_flow.spec.ts          # Fluxo B2B: login, criação de fila, dashboard (8 testes)
    b2b_queue_management.spec.ts  # Gestão: call-next, remove, clear, QR modal (8 testes)
    display_pages.spec.ts     # Display público, WebSocket, Fase 4 rich schema (15 testes)
    qr_rotation.spec.ts       # QR rotativo: código válido/inválido/expirado (7 testes)
```

### Pré-requisitos

Os testes E2E **exigem** que o stack completo via Docker esteja rodando. O Playwright interage com `http://frontend:80` via rede interna do container (variável `CI=true` ativa o `baseURL` interno).

```bash
# 1. Build e subir containers
docker compose up --build -d

# 2. Aguardar o backend responder
curl -s -f http://localhost:8001/
```

### Configuração do Playwright (`playwright.config.ts`)

| Opção | Valor em CI | Valor local |
|---|---|---|
| `baseURL` | `http://frontend:80` | `http://localhost:3000` |
| `retries` | `2` | `0` |
| `workers` | `1` (serial) | CPU automático |
| `trace` | `on-first-retry` | `on-first-retry` |
| `forbidOnly` | `true` | `false` |

> **`retries: 2` em CI**: testes com condições de corrida (timing de UI, WebSockets) podem falhar na primeira tentativa e passar na segunda. O Playwright reporta como "flaky" mas conta como passed. Na última execução, 34 passaram de primeira e 4 passaram no retry.

### Isolamento de Estado (Seed Endpoint)

Para garantir que os testes rodem sem poluir dados uns dos outros:

1. **Nome único**: filas criadas com `Date.now()` (ex: `Display Test Queue 1773...`).
2. **Endpoint Seed** (`POST /api/v1/test/seed-b2b`): detecta se o tenant já existe → faz wipe limpo de `QueueEntry` + `QueueConfig` no Postgres (nessa ordem, por FK) e do wildcard `tenant:<id>:*` no Redis.
3. **Tenant por suite**: cada arquivo `.spec.ts` usa credenciais exclusivas (`SEED_EMAIL`, `SEED_TENANT`) para evitar colisão entre suites.

### Executando Playwright

```bash
# Rodar todos os testes (38 no total)
docker compose run --rm playwright bash -c "npx playwright test --reporter=list"

# Rodar uma suite específica
docker compose run --rm playwright bash -c "npx playwright test qr_rotation.spec.ts"

# Rodar com trace para debug de testes flaky
docker compose run --rm playwright bash -c "npx playwright test --trace on"
```

### Catálogo Completo — 38 Testes E2E

#### `b2b_flow.spec.ts` — Autenticação e Dashboard B2B (7 testes)

Tenant: `E2E Test Corp` / `e2e_operator@company.com`

| # | Cenário | Verifica |
|---|---|---|
| 1 | Login page renders correctly | `#login-email`, `#login-password`, `#login-submit` visíveis |
| 2 | Successful login redirects to dashboard | `POST /auth/login` → redirect `/dashboard` → `h1` contém "Dashboard" |
| 3 | Wrong password shows error | `#login-error` aparece após credenciais inválidas |
| 4 | Dashboard is protected — redirects to /login | `localStorage.clear()` + goto `/dashboard` → redirect `/login` |
| 5 | Create a queue with form schema | Preenche nome + 2 campos → `#create-success` visível → lista contém a fila |
| 6 | View QR code for a queue | Clica botão QR na fila → `#qr-code-img` visível |
| 7 | Logout returns to login page | `#logout-btn` → redirect `/login` |

#### `b2b_queue_management.spec.ts` — Gestão de Fila (8 testes)

Tenant: `Queue Mgmt Test Corp` / `mgmt_operator@company.com`

| # | Cenário | Verifica |
|---|---|---|
| 8 | Clicking queue navigates to management page | Click na fila → URL `/dashboard/queue/{id}` → `h1` contém nome |
| 9 | Empty queue shows empty state | "Queue is empty" visível, `#members-table` oculto |
| 10 | Call Next on empty queue shows error | `#call-next-btn` está desabilitado |
| 11 | Members appear in table after joining | 2 joins via API → `member-row-0`, `member-row-1`, "Alice", "Bob" visíveis |
| 12 | Call Next removes first member and shows banner | `#call-next-btn` → `#called-user-banner` com "First Person", 1 membro restante |
| 13 | Remove button removes a member | `remove-btn-0` → "Queue is empty" |
| 14 | Clear All removes all members | 3 joins → `#clear-all-btn` (com dialog.accept) → "Queue is empty" |
| 15 | Back button returns to dashboard | "← Back to Dashboard" → URL `/dashboard` |
| — | QR Code button opens modal without navigating | `qr-btn-{id}` → `#qr-code-img` visível, URL mantém `/dashboard` |

> **Nota**: O teste "QR Code button" está no describe mas compartilha a contagem com o suite — total efetivo é 8 cenários + 1 extra = 9 `test()` blocks, porém o Playwright conta 8 porque o último bloco `describe` herda o `beforeEach`.

#### `display_pages.spec.ts` — Displays Públicos + Fase 4 Rich Schema (15 testes)

Tenant display: `Display Test Corp` / `display_operator@company.com`
Tenant rich schema: `Rich Schema Display Corp` / `rich_operator@company.com`

**Public Status Display Page (3 testes)**

| # | Cenário | Verifica |
|---|---|---|
| 16 | StatusDisplay shows queue name and counter | Página `/display/status?q={id}` → nome da fila + "AO VIVO" + counter = 0 |
| 17 | StatusDisplay updates counter when member joins | Join via API → `GET /status` confirma `queue_size: 1` |
| 18 | StatusDisplay shows error for invalid queue | UUID inexistente → "Fila não encontrada" |

**Public QR Display Page (4 testes)**

| # | Cenário | Verifica |
|---|---|---|
| 19 | QRDisplay shows queue QR code | `/display/qr?q={id}` → nome da fila + `#qr-display-img` + "Na fila agora" |
| 20 | QRDisplay shows error for invalid queue | UUID inexistente → "Queue not found" |
| 21 | Public qrcode-public endpoint returns image | `GET /qrcode-public` → 200 + `content-type: image/png` |
| 22 | Public status endpoint returns queue info | `GET /status` → 200 + `name` contém "Display Test Queue" + `queue_size` é number |

**Dashboard Display Links (1 teste)**

| # | Cenário | Verifica |
|---|---|---|
| 23 | Dashboard links to QR display and status display pages | Navegação para `/dashboard/queue/{id}` → URL correta |

**Fase 4 — Rich Form Schema / B2C Join (7 testes)**

| # | Cenário | Verifica |
|---|---|---|
| 24 | join with rich schema — all required fields present succeeds | `{nome, idade}` → 200, `status: success` |
| 25 | join with rich schema — optional field absent succeeds | `{nome, idade}` sem `cpf` → 200 |
| 26 | join with rich schema — required field missing returns 422 | `{idade}` sem `nome` → 422, "missing required field: nome" |
| 27 | join with rich schema — wrong type returns 422 | `idade: "trinta"` → 422 |
| 28 | join with rich schema — invalid CPF pattern returns 422 | `cpf: "12345678900"` → 422, "pattern" |
| 29 | join with rich schema — valid CPF pattern succeeds | `cpf: "123.456.789-00"` → 200 |
| 30 | B2CJoin page — renders labels from rich schema | `/join?q={id}` → "Nome completo" e "Idade" visíveis |

#### `qr_rotation.spec.ts` — QR Code Rotativo / Fase 3 (7 testes)

Tenant: `QR Rotation Test Corp` / `qrrot_operator@company.com`

| # | Cenário | Verifica |
|---|---|---|
| 31 | current-qr returns code and expiry when rotation enabled | `rotation_enabled: true`, `access_code` string, `expires_in > 0`, URL contém `&code=` |
| 32 | current-qr returns static URL when rotation disabled | `rotation_enabled: false`, URL sem `&code=` |
| 33 | join with rotation enabled — no code returns 403 | Join sem `access_code` → 403, "invalid or expired" |
| 34 | join with rotation enabled — wrong code returns 403 | `access_code: "wrongcode123"` → 403 |
| 35 | join with rotation enabled — correct code returns 200 | Extrai código de `current-qr` → join → 200, `status: success` |
| 36 | QRDisplay page — polling updates QR code | `/display/qr?q={id}` com rotação ativa → `#qr-display-img` visível, nome da fila |
| 37 | QueueSettings — toggle QR rotation on and off | Toggle UI (ou fallback API `PUT /queues/{id}`) → `current-qr` confirma `rotation_enabled: true` |

> **Total verificado**: 7 + 8 + 15 + 7 = **37 `test()` blocks** nos arquivos. O Playwright reporta **38** porque o `b2b_queue_management.spec.ts` tem 9 `test()` blocks (8 no describe principal + 1 "QR Code button" extra). A contagem 38 é a correta.

### Credenciais por Suite (Isolamento de Tenants)

| Suite | Tenant | Email | Password |
|---|---|---|---|
| `b2b_flow` | E2E Test Corp | `e2e_operator@company.com` | `e2e_test_pass_123` |
| `b2b_queue_management` | Queue Mgmt Test Corp | `mgmt_operator@company.com` | `mgmt_test_pass_456` |
| `display_pages` (display) | Display Test Corp | `display_operator@company.com` | `display_test_pass_789` |
| `display_pages` (rich) | Rich Schema Display Corp | `rich_operator@company.com` | `rich_test_pass_999` |
| `qr_rotation` | QR Rotation Test Corp | `qrrot_operator@company.com` | `qrrot_test_pass_321` |

Cada suite cria seu próprio tenant via `seed-b2b` no `beforeEach`. Credenciais isoladas garantem que suites paralelas não colidam.

### Helpers Reutilizados nos Specs

| Helper | Usado em | O que faz |
|---|---|---|
| `seedB2BUser(page)` | `b2b_flow`, `b2b_queue_management` | `POST /test/seed-b2b` com credenciais do suite |
| `seedAndLogin(page)` | `display_pages`, `qr_rotation` | Seed + login + cria fila com `Date.now()` → retorna `queueId` |
| `seedAndCreateRichQueue(page)` | `display_pages` (Fase 4) | Seed + login + cria fila via API com `form_schema` rico → retorna `queueId` |
| `loginAndCreateQueue(page, prefix)` | `b2b_queue_management` | Login + cria fila via UI → extrai `queueId` do `data-testid` |
| `addMemberToQueue(page, queueId, token, nome)` | `b2b_queue_management` | `POST /queue/join` via API |

---

## 3. Resolvendo Problemas de Concorrência

Em pipelines de CI com worker único e containers sob carga:

- Use atributos `data-testid` no frontend e locators `[data-testid="..."]` no Playwright.
- WebSockets demandam asserts com retry: `await element.waitFor({ state: 'visible', timeout: 8000 })`.
- Para operações pesadas de UI (Clear All, navegação pós-ação), use timeouts maiores (`15000ms`).
- Prefira `Promise.all([page.waitForResponse(...), page.click(...)])` para aguardar respostas de API antes de continuar.
- Testes que dependem de estado compartilhado (mesmo tenant, mesma fila) devem rodar com `workers: 1` para evitar corrida entre suites.

---

## 4. Diagnóstico: O que pode melhorar

Análise objetiva de gaps e oportunidades de melhoria no processo de testes atual.

### 4.1. SQLite nos testes esconde bugs reais do PostgreSQL

**Problema**: Usamos SQLite in-memory nos testes unitários, mas o banco de produção é PostgreSQL. Isso já causou um bug real: a violação de FK no `seed-b2b` que derrubou 31 testes E2E mas passou silenciosamente nos 45 unitários.

**O que fazer**:
- Ativar `PRAGMA foreign_keys = ON` no `conftest.py` para pelo menos simular FK enforcement no SQLite. Basta adicionar um event listener no engine:
  ```python
  from sqlalchemy import event
  @event.listens_for(_test_engine, "connect")
  def set_sqlite_pragma(dbapi_conn, connection_record):
      cursor = dbapi_conn.cursor()
      cursor.execute("PRAGMA foreign_keys=ON")
      cursor.close()
  ```
- **Ideal a longo prazo**: rodar testes contra PostgreSQL real via `testcontainers-python` ou `docker compose` com um serviço postgres-test dedicado. Isso eliminaria toda a classe de bugs de divergência SQLite/Postgres (tipos JSON, UUIDs nativos, transações, etc).

### 4.2. `test_queue_management.py` usa setup/teardown manual em vez de fixtures

**Problema**: Cada teste chama `setup_fake_redis()` manualmente e precisa de `try/finally` com `teardown_fake_redis()`. Isso é repetitivo e frágil — se alguém esquecer o `finally`, o override vaza para outros testes.

**O que fazer**: Converter para uma fixture pytest com `yield`:
```python
@pytest.fixture(autouse=True)
def fake_redis():
    fake = fakeredis.FakeRedis(decode_responses=True)
    app.dependency_overrides[get_redis_client] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_redis_client, None)
    fake.flushall()
```
Isso eliminaria ~40 linhas de boilerplate e tornaria impossível esquecer a limpeza.

### 4.3. `test_queue.py` usa `client` como variável global em vez de fixture

**Problema**: `test_queue.py` cria `client = TestClient(app)` no escopo do módulo (linha 12), enquanto os outros arquivos recebem `client` via fixture do `conftest.py`. A variável global é funcional, mas viola o padrão do projeto e dificulta futuras mudanças (ex: se quisermos configurar middleware diferente por teste).

**O que fazer**: Remover `client = TestClient(app)` e usar a fixture `client` do conftest em todos os testes, ajustando as assinaturas de funções.

### 4.4. Cobertura de 74% no `redis.py` — `reorder_member` sem testes unitários

**Problema**: O método `reorder_member` (linhas 95-124) é a lógica mais complexa do `QueueManager` — calcula scores intermediários entre membros adjacentes no ZSET — e é o **único método sem teste unitário**. Os testes de `queue_management.py` cobrem o endpoint `/reorder` mas não cobrem o método diretamente, e como o endpoint usa `try/finally` com mocks, as branches internas (mover para posição 0, última posição, posição intermediária) não são todas exercitadas.

**O que fazer**: Adicionar testes em `tests/database/test_redis.py`:
```python
def test_reorder_member_to_first_position(queue_manager):
    # Junta 3, reordena o último para posição 0
    ...

def test_reorder_member_to_last_position(queue_manager):
    ...

def test_reorder_member_to_middle(queue_manager):
    ...

def test_reorder_nonexistent_member(queue_manager):
    ...

def test_reorder_invalid_position(queue_manager):
    ...
```
Isso traria `redis.py` de 74% para ~95%.

### 4.5. Endpoint `qrcode-public` sem nenhum teste unitário

**Problema**: `GET /api/v1/queue/{id}/qrcode-public` (linhas 157-166 de `queue.py`) é o único endpoint do projeto sem nenhum teste unitário. Ele gera um QR Code PNG identicamente ao endpoint autenticado `qrcode` (que tem teste em `test_tenant_setup.py`), mas o público nunca é testado diretamente.

**O que fazer**: Adicionar ao `test_queue.py`:
```python
def test_qrcode_public_success(test_queue_config):
    resp = client.get(f"/api/v1/queue/{test_queue_config.id}/qrcode-public")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content.startswith(b'\x89PNG')

def test_qrcode_public_not_found():
    resp = client.get("/api/v1/queue/00000000-0000-0000-0000-000000000000/qrcode-public")
    assert resp.status_code == 404
```

### 4.6. Endpoint `reorder` sem teste unitário (linhas 101-108 de `queue_management.py`)

**Problema**: O endpoint `PUT /{queue_id}/members/reorder` nunca é chamado nos testes unitários. A cobertura de 92% em `queue_management.py` é justamente porque essas linhas são puladas. O E2E testa reorder indiretamente, mas um teste unitário com mock controlado é mais confiável para validar os branches (membro não encontrado, posição inválida).

**O que fazer**: Adicionar em `test_queue_management.py`:
```python
def test_reorder_member_success(client, db_session):
    ...

def test_reorder_member_fails_returns_400(client, db_session):
    ...
```

### 4.7. Testes E2E flaky — 4 de 38 falham na primeira tentativa

**Problema**: Na última execução, 4 testes falharam na primeira tentativa e passaram no retry (flaky). Isso é aceitável hoje com `retries: 2`, mas em CI com muitas rodadas, testes flaky erodem a confiança na suite e aumentam tempo de pipeline.

**Testes afetados e causa provável**:
| Teste | Suite | Causa provável |
|---|---|---|
| `View QR code for a queue` | `b2b_flow` | Timeout 8000ms ao esperar `#qr-code-img` — carregamento lento da imagem PNG |
| `Remove button removes a member` | `b2b_queue_management` | `#members-table` demora a renderizar após `page.goto()` |
| `Dashboard links to QR display and status display` | `display_pages` | Navegação para management page não aguarda `networkidle` |
| `join with rich schema — required field missing returns 422` | `display_pages` | `seedAndCreateRichQueue` falha no `createResp.ok()` — API de criação de fila retorna erro intermitente (possível race com seed) |

**O que fazer**:
- Adicionar `await page.waitForLoadState('networkidle')` após `page.goto()` antes de interagir com elementos da página.
- Substituir timeouts fixos (`8000ms`) por `page.waitForResponse()` onde possível — é mais determinístico que polling de DOM.
- Para o teste de rich schema: capturar e logar o status code/body do `createResp` quando `ok()` é `false`, para entender a causa raiz. Exemplo:
  ```typescript
  if (!createResp.ok()) {
      console.log(`CREATE FAILED: ${createResp.status()} - ${await createResp.text()}`);
  }
  expect(createResp.ok()).toBeTruthy();
  ```
- Considerar `test.slow()` nos testes que consistentemente precisam de retry.
- Considerar reduzir o overhead de `seedAndCreateRichQueue` — hoje ele faz login via UI + criação via API em cada teste. Uma alternativa seria usar `test.beforeAll()` para seed/login uma vez e reusar o token.

### 4.8. Cobertura E2E: cenários faltantes

Apesar de 38 testes, existem fluxos importantes que não são cobertos pelo E2E:

| Cenário faltante | Risco | Suite sugerida |
|---|---|---|
| **WebSocket broadcast real**: membro entra na fila enquanto StatusDisplay está aberto → counter atualiza live | Alto — é a feature core de tempo real e só é testada via API | `display_pages` |
| **Reorder via UI**: arrastar/mover membro de posição na tabela de gestão | Médio — endpoint existe mas E2E não exercita a UI de reorder | `b2b_queue_management` |
| **Múltiplos membros + call-next sequencial**: chamar 3x seguidas com 5 membros | Médio — valida FIFO sob sequência rápida | `b2b_queue_management` |
| **QR rotation com código expirado**: aguardar TTL expirar e tentar join | Baixo — testado nos unitários mas não E2E com Redis real | `qr_rotation` |
| **Login com email inexistente**: tenta login com email que nunca foi seeded | Baixo — coberto unitário, mas E2E valida mensagem de erro no frontend | `b2b_flow` |
| **Fila com schema rico no StatusDisplay**: verifica se display público funciona com queue que tem `form_schema` rico | Baixo — funcionalidade implícita | `display_pages` |

### 4.9. Helpers duplicados entre specs — oportunidade de refactor

**Problema**: Cada spec reimplementa `seedB2BUser` / `seedAndLogin` / `loginAndCreateQueue` com variações mínimas. São 5 funções helper espalhadas em 4 arquivos que fazem essencialmente a mesma coisa: seed → login → criar fila → retornar `queueId`.

**O que fazer**: Extrair para `e2e/tests/helpers.ts`:
```typescript
export async function seedAndLogin(page: Page, opts: {
    tenant: string; email: string; password: string;
    queueName?: string; schema?: object;
}): Promise<{ queueId: string; token: string }> { ... }
```
Isso centraliza a lógica de seed/login, evita drift entre specs, e facilita mudanças futuras (ex: se o endpoint seed mudar).

### 4.10. Sem CI pipeline — testes rodam apenas manualmente

**Problema**: Não existe GitHub Actions (ou equivalente) configurado. Os testes unitários e E2E só rodam quando alguém lembra de executar manualmente. Isso significa que regressões podem ser introduzidas silenciosamente em qualquer commit.

**O que fazer**: Criar `.github/workflows/ci.yml` com dois jobs:
1. **unit-tests**: `pytest tests/ --cov=api` com threshold de cobertura mínima (ex: 85%)
2. **e2e-tests**: `docker compose up --build -d` + `playwright test` com artefatos de trace em caso de falha

### 4.11. Sem testes de carga ou performance

**Problema**: A aplicação usa Redis ZSET + WebSockets para tempo real, mas não existe nenhum teste que valide comportamento sob carga. Se um tenant tiver 1000 membros na fila e 50 WebSocket connections simultâneas, não sabemos se o broadcast degradará.

**O que fazer** (futuro): Considerar k6 ou Locust para um smoke test de carga básico: N joins simultâneos + WebSocket listeners + call-next em sequência.

### 4.12. Resumo de prioridades

| Prioridade | Melhoria | Tipo | Impacto | Esforço |
|---|---|---|---|---|
| Alta | Ativar `PRAGMA foreign_keys=ON` no conftest | Unit | Previne bugs de FK silenciosos | 5 min |
| Alta | Testes unitários para `reorder_member` | Unit | +21% cobertura em redis.py | 30 min |
| Alta | CI pipeline (GitHub Actions) | Infra | Impede regressões silenciosas | 1-2h |
| Alta | E2E: teste de WebSocket broadcast real (counter live) | E2E | Cobre feature core não testada | 30 min |
| Média | Converter `test_queue_management.py` para fixtures | Unit | Elimina boilerplate, previne leak | 20 min |
| Média | Teste unitário para `qrcode-public` | Unit | Cobre endpoint ignorado | 10 min |
| Média | Teste unitário para endpoint `reorder` | Unit | Cobre 8 linhas faltantes | 15 min |
| Média | Corrigir `test_queue.py` para usar fixture `client` | Unit | Consistência com projeto | 10 min |
| Média | Extrair helpers E2E para `helpers.ts` | E2E | Remove duplicação entre 4 specs | 30 min |
| Média | E2E: cenários faltantes (reorder UI, call-next sequencial) | E2E | Cobre fluxos não exercitados | 1h |
| Baixa | Reduzir flakiness dos E2E (networkidle, waitForResponse) | E2E | Menos noise em CI | 1h |
| Baixa | Testes de carga (k6/Locust) | Perf | Valida escalabilidade | 2-4h |
