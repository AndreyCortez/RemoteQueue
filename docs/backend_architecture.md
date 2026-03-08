---
title: Arquitetura Backend e Testes
description: Padrões práticos implementados durante o setup do FastAPI.
tags: [fastapi, pytest, redis, security]
---

# Padrões do Backend Consolidado

Dando continuidade ao planejamento arquitetural da Fila Remota (SaaS):

## Padrão de Injeção de Segurança (Anti-IDOR)
Todas as interações nos roteadores necessitam do contexto do estabelecimento para evitar que a API vaze dados entre diferentes locais físicos.
O framework adotado utiliza `Depends(get_current_tenant_id)`, que obriga e valida nativamente os Tokens B2B na própria porta da requisição via JWT.

## Mocking de Banco Efêmero (Redis e SQLite)
Historicamente bibliotecas como `fakeredis` injetam problemas de concorrência ou Thread Hanging em interações assíncronas do `TestClient` (FastAPI/Starlette).
A fundação foi estruturada requerendo Mocks nativos do standard python (`unittest.mock.MagicMock`) diretamente aplicados nas injeções. Isso garante testes de ponta rápidos (ms) e paralelizáveis em CI/CD para o Redis.
Para o banco relacional, instanciamos um SQLite em Memória atrelado nativamente a um `StaticPool`, garantindo que múltiplas chamadas dentro dos Testes de Integração compartilhem a mesma transação sem vazamento de dados (`Dependency Injection` do FastAPI repassada diretamente ao `TestClient` em escopo).
