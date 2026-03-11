---
title: Backend — Routers, API e Padrões de Teste
description: Endpoints implementados, injeção de dependências, logging estruturado e estratégia de testes unitários.
tags: [fastapi, pytest, redis, security, testing, logging, alembic]
---

# Backend — Padrões e API Referência

## 1. Estrutura de Routers

| Arquivo | Prefixo | Auth | Descrição |
|---|---|---|---|
| `auth.py` | `/api/v1/auth` | ❌ | Login B2B → JWT |
| `tenant_setup.py` | `/api/v1/b2b` | ✅ JWT | Criar/atualizar filas, listar, QR Code |
| `queue_management.py` | `/api/v1/b2b/queue` | ✅ JWT | Gestão da fila (list/remove/reorder/clear/size/call-next) |
| `queue.py` | `/api/v1/queue` | Misto | B2C join, WebSocket, status público, QR público, QR rotativo |
| `test_seed.py` | `/api/v1/test` | ❌ dev-only | Seed de usuário B2B para E2E (bloqueado em `ENVIRONMENT=production`) |

## 2. Endpoints por Domínio

### B2B — Autenticados (header: `x-tenant-token`)

```
POST /api/v1/auth/login                              Login → JWT
POST /api/v1/b2b/queues                              Criar fila (com form_schema simples ou rico)
GET  /api/v1/b2b/queues                              Listar filas do tenant
PUT  /api/v1/b2b/queues/{queue_id}                   Atualizar fila (nome, qr_rotation_enabled, qr_rotation_interval)
GET  /api/v1/b2b/queues/{queue_id}/qrcode            QR Code autenticado (PNG stream)

GET  /api/v1/b2b/queue/{queue_id}/members            Listar membros da fila (em ordem)
DELETE /api/v1/b2b/queue/{queue_id}/members          Remover membro
PUT  /api/v1/b2b/queue/{queue_id}/members/reorder    Mudar posição de membro
POST /api/v1/b2b/queue/{queue_id}/call-next          Chamar próximo (broadcast WS)
POST /api/v1/b2b/queue/{queue_id}/clear              Limpar toda a fila
GET  /api/v1/b2b/queue/{queue_id}/size               Tamanho atual da fila
```

### B2C / Público — Sem autenticação

```
GET  /api/v1/queue/{queue_id}                        Info pública (nome + form_schema)
POST /api/v1/queue/join                              Entrar na fila (valida schema + access_code se rotação ativa)
GET  /api/v1/queue/{queue_id}/status                 Status público (nome + tamanho)
GET  /api/v1/queue/{queue_id}/qrcode-public          QR Code sem auth (para display pages)
GET  /api/v1/queue/{queue_id}/current-qr             Código de acesso atual + TTL (Fase 3)
WS   /api/v1/queue/{queue_id}/ws                     WebSocket real-time
```

### Evento WebSocket — `call-next`
Quando o operador chama o próximo, o broadcast emite:
```json
{
  "event": "queue_member_called",
  "called": { "nome": "João Silva", "... outros campos ..." }
}
```
O `StatusDisplay.tsx` e o `B2CJoin.tsx` usam esse evento para atualização em tempo real.

## 3. Fase 3 — QR Code Rotativo

`GET /api/v1/queue/{id}/current-qr` retorna:
```json
{
  "rotation_enabled": true,
  "access_code": "abc123XY",
  "expires_in": 47,
  "url": "/join?q=<id>&code=abc123XY"
}
```

`POST /api/v1/queue/join` exige `access_code` quando `qr_rotation_enabled=true`. Código armazenado no Redis com `SETEX` (TTL automático). Sem código válido → HTTP 403.

## 4. Fase 4 — Form Schema Rico

`form_schema` suporta dois formatos backwards-compatíveis:

```json
// Simples (Fase 1)
{ "nome": "string", "idade": "integer" }

// Rico (Fase 4) — com label, placeholder, required, pattern
{
  "nome": { "type": "string", "label": "Nome completo", "required": true },
  "cpf":  { "type": "string", "label": "CPF", "required": false,
             "pattern": "^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$" },
  "idade": { "type": "integer", "label": "Idade", "required": true }
}
```

A função `validate_payload_against_schema` em `queue.py` normaliza ambos os formatos e valida:
- Campos obrigatórios ausentes → HTTP 422
- Tipo incorreto (`integer`, `boolean`, `string`) → HTTP 422
- Regex não bate (`pattern`) → HTTP 422

## 5. Logging Estruturado

`api/logging_config.py` configura dois componentes ativados em `main.py`:

- **`configure_logging()`** — substitui o handler raiz por `JsonFormatter` (emite JSON lines por request)
- **`RequestLoggingMiddleware`** — emite uma linha de log por request com `trace_id` UUID, `method`, `path`, `status`, `duration_ms`, `client_ip`; propaga `X-Trace-Id` no header de resposta

```json
{"ts": "2026-03-10T22:00:00", "level": "info", "logger": "api.request",
 "msg": "POST /api/v1/queue/join 200",
 "trace_id": "a1b2-...", "method": "POST", "path": "/api/v1/queue/join",
 "status": 200, "duration_ms": 12.4, "client_ip": "172.18.0.1"}
```

## 6. Injeção de Dependências

```python
# Dependências reutilizáveis via FastAPI Depends()
get_current_tenant_id  → valida JWT, retorna tenant_id (IDOR guard)
get_db                 → sessão SQLAlchemy por request
get_redis_client       → Redis client (substituível via dependency_overrides em testes)
```

## 7. Padrões de Teste

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
fake = fakeredis.FakeRedis(decode_responses=True)
app.dependency_overrides[get_redis_client] = lambda: fake
```

### FakeRedis via unittest.mock.patch (test_seed.py)
```python
# Para funções que chamam get_redis_client() diretamente (não via Depends)
with patch("api.routers.test_seed.get_redis_client", return_value=fake_redis):
    ...
```

### Cobertura atual
```
45 testes passando — 0 falhas — 91% cobertura global
tests/api/test_auth.py             (4 testes)
tests/api/test_tenant_setup.py     (7 testes)
tests/api/test_queue.py            (12 testes — inclui Fase 4 rich schema)
tests/api/test_queue_management.py (10 testes)
tests/api/test_test_seed.py        (5 testes — 100% cobertura test_seed.py)
tests/api/test_websockets.py       (2 testes)
tests/database/test_postgres.py    (1 teste)
tests/database/test_redis.py       (4 testes)
```

### Executar localmente
```bash
export PATH="$HOME/.local/bin:$PATH"
PYTHONPATH=/home/wsl/RemoteQueue pytest tests/ --cov=api --cov-report=term-missing -q
```
