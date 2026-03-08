---
title: Backend — Routers, API e Padrões de Teste
description: Endpoints implementados, injeção de dependências, e estratégia de testes unitários.
tags: [fastapi, pytest, redis, security, testing]
---

# Backend — Padrões e API Referência

## 1. Estrutura de Routers

| Arquivo | Prefixo | Auth | Descrição |
|---|---|---|---|
| `auth.py` | `/api/v1/auth` | ❌ | Login B2B → JWT |
| `tenant_setup.py` | `/api/v1/b2b` | ✅ JWT | Criar filas, listar, QR Code |
| `queue_management.py` | `/api/v1/b2b/queue` | ✅ JWT | Gestão da fila (list/remove/reorder/clear/size/call-next) |
| `queue.py` | `/api/v1/queue` | Misto | B2C join, WebSocket, status público, QR público |
| `test_seed.py` | `/api/v1/test` | ❌ dev-only | Seed de usuário B2B para E2E |

## 2. Endpoints por Domínio

### B2B — Autenticados (header: `x-tenant-token`)

```
POST /api/v1/auth/login                         Login → JWT
POST /api/v1/b2b/queues                         Criar fila
GET  /api/v1/b2b/queues                         Listar filas do tenant
GET  /api/v1/b2b/queues/{queue_id}/qrcode       QR Code autenticado (PNG stream)

GET  /api/v1/b2b/queue/{queue_id}/members       Listar membros da fila (em ordem)
DELETE /api/v1/b2b/queue/{queue_id}/members     Remover membro
PUT  /api/v1/b2b/queue/{queue_id}/members/reorder  Mudar posição de membro
POST /api/v1/b2b/queue/{queue_id}/call-next     Chamar próximo (broadcast WS)
POST /api/v1/b2b/queue/{queue_id}/clear         Limpar toda a fila
GET  /api/v1/b2b/queue/{queue_id}/size          Tamanho atual da fila
```

### B2C / Público — Sem autenticação

```
GET /api/v1/queue/{queue_id}                    Info pública da fila (nome + form_schema)
POST /api/v1/queue/join                         Entrar na fila
GET /api/v1/queue/{queue_id}/status             Status público (nome + tamanho)
GET /api/v1/queue/{queue_id}/qrcode-public      QR Code sem auth (para display pages)
WS  /api/v1/queue/{queue_id}/ws                 WebSocket real-time
```

### Evento WebSocket — `call-next`
Quando o operador chama o próximo, o broadcast emite:
```json
{
  "event": "queue_member_called",
  "called": { "nome": "João Silva", "... outros campos ..." }
}
```
O `StatusDisplay.tsx` usa esse evento para mostrar quem foi chamado na TV em tempo real.

## 3. Injeção de Dependências

```python
# Dependências reutilizáveis via FastAPI Depends()
get_current_tenant_id  → valida JWT, retorna tenant_id (IDOR guard)
get_db                 → sessão SQLAlchemy por request
get_redis_client       → Redis client (substituível via dependency_overrides em testes)
```

## 4. Padrões de Teste

### SQLite in-Memory com StaticPool
```python
# tests/conftest.py
_test_engine = create_engine("sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool)
app.dependency_overrides[get_db] = lambda: _TestSessionLocal()
```
Garante que TestClient e fixtures de banco compartilhem a **mesma** instância de memória.

### FakeRedis via dependency_overrides
```python
# Nos testes que precisam de Redis
fake = fakeredis.FakeRedis(decode_responses=True)
app.dependency_overrides[get_redis_client] = lambda: fake
# ... testes ...
app.dependency_overrides.pop(get_redis_client)
```

### Cobertura atual
```
24 testes passando — 0 falhas
tests/api/test_auth.py             (4 testes)
tests/api/test_tenant_setup.py     (4 testes)
tests/api/test_queue_management.py (10 testes)
tests/api/test_websockets.py       (2 testes)
tests/database/test_postgres.py    (1 teste)
tests/database/test_redis.py       (3 testes)
```
