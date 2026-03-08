---
title: Esquema de Banco de Dados — PostgreSQL e Redis
description: Modelos SQLAlchemy, estratégia de auditoria com QueueEntry e estrutura de ZSET no Redis.
tags: [database, postgres, redis, sqlalchemy, schema]
---

# Design de Dados — PostgreSQL e Redis

## PostgreSQL (Source of Truth)

### Modelos SQLAlchemy (em `api/database/models.py`)

```
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│   tenants   │──1:N──│  b2b_users  │       │  queue_configs  │
│─────────────│       │─────────────│       │─────────────────│
│ id (UUID)   │       │ id (UUID)   │       │ id (UUID)       │
│ name        │       │ tenant_id ──┤──FK──▶│ tenant_id (FK)  │
└─────────────┘       │ email       │       │ name            │
       │              │ hashed_pass │       │ form_schema JSON│
       └──────────────┴─────────────┘       └────────┬────────┘
                                                      │
                                               1:N    │
                                            ┌─────────▼────────┐
                                            │  queue_entries   │
                                            │──────────────────│
                                            │ id (UUID)        │
                                            │ queue_id (FK)    │
                                            │ tenant_id (FK)   │
                                            │ user_data (JSON) │
                                            │ status (str)     │
                                            │ created_at       │
                                            └──────────────────┘
```

### `queue_configs.form_schema` — Formulário Dinâmico

```json
// Exemplo: fila com 2 campos
{ "nome": "string", "numero_senha": "integer" }
```
O backend valida `user_data` dos clientes B2C contra esse schema antes de inserir na fila Redis.

### `queue_entries` — Histórico de Auditoria

Toda vez que um membro sai da fila (chamado ou removido), um registro é gravado:

```python
# Status possíveis: 'called', 'removed'
entry = QueueEntry(
    queue_id=queue_id,
    tenant_id=tenant_id,
    user_data=user_data,   # JSON dos dados do formulário
    status="called"        # ou "removed"
)
```

Isso permite futuros dashboards analíticos (tempo médio de espera, pico de horário, etc).

## Redis (Orquestrador de Filas em Tempo Real)

### Estrutura da Chave

```
tenant:{tenant_id}:queue:{queue_id}  →  Sorted Set (ZSET)
```

O `score` é o `time.time()` no momento da entrada — garante ordenação FIFO com resolução de microsegundos.

### Operações Implementadas em `QueueManager`

| Método | Redis Op | Complexidade |
|---|---|---|
| `join_queue` | `ZADD` + `ZRANK` | O(log N) |
| `get_position` | `ZRANK` | O(log N) |
| `call_next` | `ZPOPMIN` | O(log N) |
| `list_members` | `ZRANGE WITHSCORES` | O(N) |
| `remove_member` | `ZREM` | O(log N) |
| `reorder_member` | `ZREM` + `ZADD` | O(log N) |
| `clear_queue` | `DELETE` | O(1) |
| `get_queue_size` | `ZCARD` | O(1) |

### Isolamento Multi-Tenant

O namespace `tenant:{tenant_id}:queue:{queue_id}` garante que duas filas com o mesmo `queue_id` de tenants diferentes **nunca colidam** no Redis. IDOR impossível a nível de banco efêmero.

## Sessão de Banco para Testes

```python
# tests/conftest.py — SQLite in-memory com StaticPool
_test_engine = create_engine("sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool)
# fixture autouse → cria e dropa tabelas entre cada teste
```
