---
title: Onboarding — Remote Queue SaaS
description: Guia completo para novos colaboradores entenderem o projeto e ficarem produtivos rapidamente.
tags: [onboarding, getting-started, architecture, saas, remote-queue]
---

# Onboarding — Remote Queue SaaS

Bem-vindo ao **RemoteQueue** — um SaaS multi-tenant para gestão de filas físicas via QR Code.

## O que é o produto

Estabelecimentos B2B (salões, clínicas, restaurantes) criam filas e as gerenciam via painel web. Clientes B2C entram na fila escaneando um QR Code no celular e recebem atualizações de posição em tempo real.

**Dois domínios distintos:**
- **B2B (operadores):** Login com JWT → painel de gestão → chamar próximo, remover, reordenar membros
- **B2C (clientes finais):** Escaneia QR → preenche formulário dinâmico → acompanha posição via WebSocket

---

## Stack e arquitetura em 5 minutos

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + TypeScript, servido por Nginx |
| Backend | Python 3.12 + FastAPI (REST + WebSockets) |
| Banco relacional | PostgreSQL 15 — source of truth |
| Fila em memória | Redis 7 (ZSET) — posicionamento O(log N) por timestamp |
| Infra | Docker Compose (dev e prod) |

**Isolamento multi-tenant:** o `tenant_id` vem do JWT. Todo endpoint B2B filtra queries com `WHERE tenant_id = :tenant_id` — não há RLS no banco, a segurança é enforced nos routers via `Depends(get_current_tenant_id)`.

**Proxy Nginx:** o frontend em `:3000` faz reverse proxy de `/api/*` e WebSockets para o backend interno. O backend **não é exposto** diretamente.

---

## Subindo o ambiente

```bash
# Build e sobe tudo (PostgreSQL, Redis, backend, frontend, playwright)
docker compose up --build -d

# Alternativa: script de demo que faz down -v + build + seed + abre o navegador
bash scripts/manual_test.sh
```

Após o start, o backend roda em `:8001` e o frontend em `:3000`.

**Seed de dados de teste:**
```bash
curl -s -X POST http://localhost:8001/api/v1/test/seed-b2b \
  -H "Content-Type: application/json" \
  -d '{"tenant_name": "Minha Empresa", "email": "admin@b2b.com", "password": "password123"}'
```

---

## Estrutura de routers (backend)

| Arquivo | Prefixo | Auth | Audiência |
|---|---|---|---|
| `auth.py` | `/api/v1/auth` | ❌ | Login B2B → JWT |
| `tenant_setup.py` | `/api/v1/b2b` | ✅ JWT | CRUD de filas, QR code |
| `queue_management.py` | `/api/v1/b2b/queue` | ✅ JWT | Gestão: list/remove/reorder/call-next/clear |
| `queue.py` | `/api/v1/queue` | Misto | B2C join, WebSocket, status público, QR rotativo |
| `test_seed.py` | `/api/v1/test` | ❌ dev-only | Seed E2E (bloqueado em `ENVIRONMENT=production`) |

---

## Páginas do frontend

| Página | Rota | Auth |
|---|---|---|
| Login | `/login` | Pública |
| Dashboard | `/dashboard` | B2B (JWT) |
| Gestão de fila | `/dashboard/queue/:id` | B2B (JWT) |
| Entrar na fila (B2C) | `/join?q=<id>` | Pública |
| QR Display (tablet/kiosk) | `/display/qr?q=<id>` | Pública |
| Status Display (TV/monitor) | `/display/status?q=<id>` | Pública |

---

## Funcionalidades-chave para entender

### Form Schema dinâmico (Fase 4)

Filas podem ter formulários customizados com schema simples ou rico:

```json
// Rico: suporta label, required, pattern
{
  "nome": { "type": "string", "label": "Nome completo", "required": true },
  "cpf":  { "type": "string", "label": "CPF", "required": false,
             "pattern": "^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$" }
}
```

O backend valida o payload contra o schema em `queue.py::validate_payload_against_schema`. O frontend em `B2CJoin.tsx` renderiza os inputs dinamicamente a partir do schema.

### QR Code Rotativo (Fase 3)

Quando `qr_rotation_enabled=true`, o `POST /queue/join` exige um `access_code` válido:
- Código armazenado no Redis com `SETEX` (TTL configurável)
- `GET /api/v1/queue/{id}/current-qr` retorna o código atual + `expires_in`
- Sem código ou código errado → HTTP 403

### WebSocket — tempo real

`WS /api/v1/queue/{queue_id}/ws` — o `ConnectionManager` em `api/dependencies/websockets.py` faz broadcast para todos os clientes conectados na fila. Evento principal:

```json
{ "event": "queue_member_called", "called": { "nome": "João", "..." } }
```

`StatusDisplay.tsx` e `B2CJoin.tsx` consomem esse evento para atualizar a UI sem polling.

---

## Rodando testes

```bash
# Unitários (SQLite in-memory + FakeRedis — sem Docker)
pytest

# Um arquivo específico
pytest tests/api/test_queue_management.py

# Com cobertura
pytest --cov=api --cov-report=term-missing

# E2E (exige stack completo rodando via Docker)
docker compose run --rm playwright bash -c "npx playwright test --reporter=list"

# Suite específica
docker compose run --rm playwright bash -c "npx playwright test qr_rotation.spec.ts"
```

**Atenção:** os testes unitários usam SQLite, que **não enforça foreign keys** por padrão. Bugs de integridade referencial podem passar nos unitários e explodir nos E2E (que usam PostgreSQL real). Sempre deletar filhos antes de pais em operações de limpeza.

---

## Padrões de teste

- **SQLite in-memory com StaticPool** — `tests/conftest.py` cria/dropa tabelas por teste (independente do Alembic)
- **FakeRedis via `dependency_overrides`** — para routers que usam `Depends(get_redis_client)`
- **FakeRedis via `unittest.mock.patch`** — para `test_seed.py`, onde `get_redis_client()` é chamado diretamente

---

## Documentação disponível

| Documento | O que cobre |
|---|---|
| [architecture.md](architecture.md) | Stack, fluxos B2B/B2C, segurança multi-tenant |
| [backend_architecture.md](backend_architecture.md) | Endpoints, injeção de dependências, logging estruturado, Fases 3 e 4 |
| [database_schema.md](database_schema.md) | Modelos PostgreSQL, estrutura Redis (ZSET) |
| [frontend_integration.md](frontend_integration.md) | Contratos de API, eventos WebSocket, páginas públicas |
| [testing.md](testing.md) | Guia completo de testes unitários e E2E (38 testes Playwright catalogados) |
| [deployment.md](deployment.md) | Docker Compose, Nginx, scripts de deploy |
| [roadmap.md](roadmap.md) | Débitos técnicos e próximos passos |
