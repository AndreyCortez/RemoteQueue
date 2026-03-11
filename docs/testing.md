---
title: Guia de Testes (E2E e Unitários)
description: Diretrizes de testes de ponta a ponta (Playwright) e testes unitários de API/Banco de dados (Pytest).
tags: [testing, e2e, unit-tests, playwright, pytest]
---

# Remote Queue SaaS — Guia de Testes

Garantir a estabilidade da aplicação em tempo real exige duas camadas fundamentais de testes: **Unitários** (cobrindo lógica de estado e banco) e **E2E** (cobrindo a visualização no navegador e concorrência).

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
api/database/models.py          95%
api/database/postgres.py       100%
api/database/redis.py           74%   (métodos de QR rotation cobertos pelos E2E)
api/dependencies/security.py    86%
api/dependencies/websockets.py  92%
api/logging_config.py           97%
api/main.py                     94%
api/routers/auth.py            100%
api/routers/queue.py            88%
api/routers/queue_management.py 92%
api/routers/tenant_setup.py     99%
api/routers/test_seed.py       100%
```

### Padrões

- **SQLite in-memory + StaticPool**: `conftest.py` força `settings.database_url = "sqlite:///:memory:"` e cria/dropa tabelas em cada teste via `Base.metadata.create_all` (independente do Alembic).
- **FakeRedis via dependency_overrides**: Para routers que usam `get_redis_client` como `Depends`, sobrescreve com `fakeredis.FakeRedis`.
- **FakeRedis via `unittest.mock.patch`**: Para `test_seed.py`, que chama `get_redis_client()` diretamente.
- **Isolamento por fixture**: `autouse=True` no `reset_db` garante banco limpo entre cada teste.

---

## 2. Testes End-to-End (E2E / Playwright)

Os testes E2E simulam o fluxo do usuário em uma instância completa (Frontend Nginx + Backend API + Redis + Postgres).

### Pré-requisitos

Os testes E2E **exigem** que o stack completo via Docker esteja rodando. O Playwright interage com `http://frontend:80` via rede interna do container.

```bash
# 1. Build e subir containers
docker compose up --build -d

# 2. Aguardar healthcheck do backend
curl -s -f http://localhost:8001/
```

### Isolamento de Estado (Seed Endpoint)

Para garantir que os testes rodem sem poluir dados uns dos outros:
1. **Nome único**: Filas criadas com `Date.now()` (ex: `Display Test Queue 1773...`).
2. **Endpoint Seed** (`POST /api/v1/test/seed-b2b`): Detecta se o tenant já existe → faz wipe limpo de `QueueConfig` no Postgres e do wildcard `tenant:<id>:*` no Redis.

### Executando Playwright

```bash
# Rodar todos os testes
docker compose run --rm playwright bash -c "npx playwright test --reporter=list"

# Rodar um suite específico
docker compose run --rm playwright bash -c "npx playwright test qr_rotation.spec.ts"
```

### Suites Disponíveis

| Suite | Cenários |
|---|---|
| `b2b_flow.spec.ts` | Login B2B, criação de fila, navegação do dashboard |
| `b2b_queue_management.spec.ts` | Chamar próximo, remover membro, limpar fila |
| `display_pages.spec.ts` | StatusDisplay (WebSocket), QRDisplay, counter, Fase 4 rich schema (7 cenários) |
| `qr_rotation.spec.ts` | QR rotativo: código válido/inválido/expirado, toggle settings, polling QRDisplay (6 cenários) |

### Cenários E2E — Fase 3 (QR Rotation)

- `current-qr` retorna código + TTL quando rotação ativa
- `current-qr` retorna URL estática quando rotação desativada
- Join sem código → 403
- Join com código errado → 403
- Join com código correto → 200 + `status: success`
- QRDisplay carrega sem erro para fila com rotação ativa
- Toggle de rotação via UI ou via API (fallback)

### Cenários E2E — Fase 4 (Rich Schema)

- Join com todos os campos obrigatórios presentes → 200
- Join sem campo opcional (`cpf`) → 200
- Join sem campo obrigatório (`nome`) → 422
- Join com tipo errado (`idade: "trinta"`) → 422
- Join com CPF fora do padrão regex → 422
- Join com CPF no padrão correto → 200
- `B2CJoin` renderiza labels do schema rico (`Nome completo`, `Idade`)

---

## 3. Resolvendo Problemas de Concorrência

Em pipelines de CI com alta concorrência:
- Use atributos `data-testid` no frontend e locators `[data-testid="..."]` no Playwright.
- WebSockets demandam asserts com retry: `await element.waitFor({ state: 'visible', timeout: 8000 })`.
- Prefira `Promise.all([page.waitForResponse(...), page.click(...)])` para aguardar respostas de API antes de continuar.
