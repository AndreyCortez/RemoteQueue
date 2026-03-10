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
- `tests/api/`: Testes de roteamento (`test_auth.py`, `test_queue.py`, `test_queue_management.py`, etc).
- `tests/database/`: Testes diretos dos drivers (`test_postgres.py`, `test_redis.py`).

### Executando Localmente (no Docker)

```bash
# Rode a suíte de testes unitários do backend diretamente dentro do container ativo:
docker compose exec backend pytest tests/

# Para rodar com relatório de cobertura (se instalado pytest-cov):
docker compose exec backend pytest --cov=api tests/
```

### Padrões
- Utilize as fixtures definidas em `tests/conftest.py` para injetar `client` do FastAPI.
- A configuração dos testes sobrescreve o banco com um SQLite em memória ou esquemas de teste para prevenir poluição de produção.

---

## 2. Testes End-to-End (E2E / Playwright)

Os testes e2e simulam o fluxo do usuário em uma instância completa (Frontend servido pelo Nginx + Backend API + Redis + Postgres).

### Pré-requisitos
Os testes E2E **exigem** que o stack completo via Docker esteja rodando. O Playwright irá interagir com o `http://localhost:3000` (ou `http://frontend:80` via rede do container).

```bash
# 1. Build e subir containers
docker compose up --build -d

# 2. Aguardar healthcheck do backend
curl -s -f http://localhost:8001/api/v1/health
```

### Isolamento de Estado (Seed Endpoint)

Para garantir que os testes rodem de forma paralela sem poluir os dados um do outro:
1. **Nome Único**: Criamos filas usando `Date.now()` para UUIDs na UI (ex: `Display Test Queue 1773...`).
2. **Endpoint Seed** (`POST /api/v1/test/seed-b2b`): O Playwright invoca esse endpoint antes de rodar as suítes. O backend detecta se o tenant de teste já existe e faz um **wipe limpo** das tabelas (`QueueConfig`) e de todo o **wildcard do Redis** (`tenant:<id>:*`).

### Executando Playwright

```bash
# Rodar todos os testes no container docker isolado do playwright
docker compose run --rm playwright bash -c "npx playwright test --reporter=list"

# Rodar um suite específico
docker compose run --rm playwright bash -c "npx playwright test display_pages.spec.ts"
```

### Suites Disponíveis
- `b2b_flow.spec.ts`: Fluxo B2B de Autenticação e Criação de Fila no Dashboard.
- `b2b_queue_management.spec.ts`: Gestão ativa da fila (chamar o próximo, remover, limpar toda a fila).
- `display_pages.spec.ts`: Páginas B2C abertas ao público (`/display/status` e `/display/qr`), garantindo que WebSockets funcionam sem autenticação JWT.

## 3. Resolvendo Problemas de Concorrência

Em pipelines de CI com alta concorrência:
- Use atributos `data-testid` no frontend e locators `[data-testid="..."]` no Playwright em vez de buscas flexíveis por texto (ex: `text=0`).
- WebSockets podem demandar asserts de estado com retry. Utilize `await element.waitFor({ state: 'visible', timeout: 8000 })` em telas que dependem de rede para carregar.
