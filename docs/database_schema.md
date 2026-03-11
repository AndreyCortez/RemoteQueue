---
title: Esquema de Banco de Dados — PostgreSQL e Redis
description: Modelos SQLAlchemy, migrações Alembic, estratégia de auditoria com QueueEntry, estrutura de ZSET e códigos de acesso no Redis.
tags: [database, postgres, redis, sqlalchemy, schema, alembic]
---

# Design de Dados — PostgreSQL e Redis

## PostgreSQL (Source of Truth)

### Modelos SQLAlchemy (em `api/database/models.py`)

```
┌─────────────┐       ┌─────────────┐       ┌──────────────────────┐
│   tenants   │──1:N──│  b2b_users  │       │    queue_configs      │
│─────────────│       │─────────────│       │──────────────────────│
│ id (str36)  │       │ id (str36)  │       │ id (str36)           │
│ name        │       │ tenant_id ──┼──FK──▶│ tenant_id (FK)       │
└─────────────┘       │ email       │       │ name                 │
       │              │ hashed_pass │       │ form_schema (JSON)   │
       └──────────────┴─────────────┘       │ qr_rotation_enabled  │
                                            │ qr_rotation_interval │
                                            └──────────┬───────────┘
                                                       │
                                                1:N    │
                                            ┌──────────▼───────────┐
                                            │    queue_entries      │
                                            │──────────────────────│
                                            │ id (str36)           │
                                            │ queue_id (FK)        │
                                            │ tenant_id (FK)       │
                                            │ user_data (JSON)     │
                                            │ status (str)         │
                                            │ joined_at (DateTime) │
                                            │ resolved_at (DateTime│
                                            └──────────────────────┘
```

### `queue_configs.form_schema` — Formulário Dinâmico

Suporta dois formatos backwards-compatíveis (Fase 1 e Fase 4):

```json
// Simples (Fase 1)
{ "nome": "string", "numero_senha": "integer" }

// Rico (Fase 4) — metadados por campo
{
  "nome":  { "type": "string",  "label": "Nome completo", "required": true },
  "cpf":   { "type": "string",  "label": "CPF", "required": false,
              "pattern": "^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$" },
  "idade": { "type": "integer", "label": "Idade",         "required": true }
}
```

Tipos suportados: `string`, `integer`, `boolean`. O backend valida `user_data` dos clientes B2C contra esse schema antes de inserir na fila Redis.

### `queue_configs.qr_rotation_enabled / qr_rotation_interval` — Fase 3

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `qr_rotation_enabled` | Boolean | `False` | Ativa exigência de `access_code` no join |
| `qr_rotation_interval` | Integer | `300` | TTL do código em segundos (padrão 5 min) |

### `queue_entries` — Histórico de Auditoria

Toda vez que um membro é chamado ou removido, um registro é gravado:

```python
# Status possíveis: 'called', 'removed', 'waiting'
entry = QueueEntry(
    queue_id=queue_id,
    tenant_id=tenant_id,
    user_data=user_data,   # JSON dos dados do formulário
    status="called"
)
```

Permite futuros dashboards analíticos (tempo médio de espera, pico de horário, etc).

## Alembic — Migrações Versionadas

As migrações substituem o `Base.metadata.create_all` que existia em `main.py`. No startup do Docker, `alembic upgrade head` é executado antes do uvicorn.

```
alembic/
  env.py           # lê settings.database_url; importa todos os models
  versions/
    e6d9429008c5_initial_schema.py  # cria as 4 tabelas + índices
```

Para criar uma nova migração após alterar um modelo:
```bash
alembic revision --autogenerate -m "descricao"
alembic upgrade head
```

## Redis (Orquestrador de Filas em Tempo Real)

### Estrutura das Chaves

```
tenant:{tenant_id}:queue:{queue_id}   →  Sorted Set (ZSET) — fila ativa
access_code:{queue_id}                →  String com TTL (SETEX) — Fase 3
```

O `score` do ZSET é o `time.time()` no momento da entrada — garante FIFO com resolução de microsegundos.

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
| `generate_access_code` | `SETEX` | O(1) |
| `validate_access_code` | `GET` | O(1) |
| `get_access_code_ttl` | `TTL` | O(1) |

### Isolamento Multi-Tenant

O namespace `tenant:{tenant_id}:queue:{queue_id}` garante que duas filas com o mesmo `queue_id` de tenants diferentes **nunca colidam** no Redis. IDOR impossível a nível de banco efêmero.

## Sessão de Banco para Testes

```python
# tests/conftest.py — SQLite in-memory com StaticPool
_test_engine = create_engine("sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool)
# fixture autouse → cria e dropa tabelas entre cada teste via Base.metadata.create_all
# (os testes NÃO dependem do Alembic — usam SQLAlchemy diretamente)
```
