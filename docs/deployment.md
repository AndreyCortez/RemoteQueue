---
title: Deployment & Containerização
description: Guia de implantação segura da Fila Remota utilizando orquestração local com Docker.
tags: [deployment, docker, compose, networking, alembic, logging]
---

# Padrões de Virtualização e Entrega Contínua

O SaaS multi-tenant emprega a filosofia estrita de configuração declarativa. O sistema jamais deve exigir configuração residual na máquina Host (VPS) para funcionar.

## Docker Compose: A Planta Baixa da Infraestrutura

A arquitetura exige os seguintes containers operando na mesma rede virtual privada (`bridge`):
1. **FastAPI Backend (`remotequeue-backend`)**: Aplicação Python 3.12 (slim) não exposta diretamente.
2. **React SPA + Nginx (`remotequeue-frontend`)**: Compila a interface B2B e B2C. Serve estáticos e atua como **Reverse Proxy**. Todas as rotas `/api/*` e conexões WebSockets são repassadas para o Backend, garantindo isolamento.
3. **Postgres 15**: Driver de dados persistentes.
4. **Redis 7**: Cache In-Memory temporário para filas e pub/sub.

## Startup do Backend — Sequência de Inicialização

O `CMD` do `Dockerfile.backend` executa dois passos em sequência:

```bash
sh -c "alembic upgrade head && uvicorn api.main:app --host 0.0.0.0 --port 8000"
```

1. **`alembic upgrade head`**: Aplica todas as migrações pendentes no PostgreSQL antes de servir qualquer request. Idempotente — se o schema já está atualizado, não faz nada.
2. **`uvicorn`**: Inicia o servidor ASGI. `configure_logging()` e `RequestLoggingMiddleware` já estão ativos desde o `main.py`.

O container do backend só inicia após os healthchecks do `db` e `redis` passarem (`depends_on: condition: service_healthy`).

## Logging Estruturado em Produção

Todos os logs são emitidos como **JSON lines** na stdout, prontos para ingestão por Loki, Datadog, CloudWatch ou qualquer pipeline NDJSON:

```json
{"ts": "2026-03-10T22:00:01", "level": "info", "logger": "api.request",
 "msg": "POST /api/v1/queue/join 200",
 "trace_id": "a1b2c3d4-...", "method": "POST", "path": "/api/v1/queue/join",
 "status": 200, "duration_ms": 14.3, "client_ip": "172.18.0.5"}
```

O header `X-Trace-Id` é propagado em todas as respostas para correlação entre frontend e backend.

## Migrações Alembic — Fluxo de Desenvolvimento

```bash
# Após alterar um modelo SQLAlchemy
alembic revision --autogenerate -m "add_campo_x"
alembic upgrade head

# Verificar histórico
alembic history --verbose

# Reverter uma migração
alembic downgrade -1
```

As migrações ficam em `alembic/versions/`. O `alembic/env.py` lê `settings.database_url` automaticamente (via `.env` ou variável de ambiente `DATABASE_URL`).

## Scripts de Desenvolvimento (`manual_test.sh`)

Para simular o ambiente rigorosamente como em Produção, utilize o script `scripts/manual_test.sh`:

1. Destrói volumes e recursos residuais (`docker compose down -v`).
2. Faz o build rigoroso dos serviços locais (FastAPI e Vite/React) do zero.
3. Aguarda por dependências e faz o seeding automático (`/api/v1/test/seed-b2b`) para provisionamento de dados sem cliques manuais.
4. Entrega a aplicação completamente pronta nos endereços locais (`localhost:3000` / `localhost:8001`).

## Restrição de Networking Interno (Segurança)

Bancos de Dados não podem ter suas portas mapeadas publicamente para o Host (ex: `0.0.0.0:5432`). O tráfego ocorre apenas dentro do espectro Docker isolado via ponte. Apenas os containers de aplicação e proxy conversam com os bancos.

## Estrutura do Proxy (`frontend/nginx.conf`)

O container frontend possui um `nginx.conf` que:
- Roteia `/api/*` para `proxy_pass http://backend:8000` com headers de Upgrade para WebSockets.
- Aplica **rate limiting**: `limit_conn_zone` + `limit_conn ws_limit 20` por IP (proteção contra flood de conexões).
- Serve o SPA React com fallback 404 → `index.html` para SPA routing funcionar.
