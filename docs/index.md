---
title: Índice da Documentação - Remote Queue SaaS
description: Mapa central de toda a arquitetura e diretrizes de engenharia do projeto.
tags: [index, saas, fila, remote-queue]
---

# Remote Queue SaaS — Documentação

Sistema de fila remota **multi-tenant** baseado em QR Code. Estabelecimentos B2B criam filas e gerenciam clientes via painel web; clientes B2C entram na fila escaneando um QR Code com o celular.

## Status de Implementação

| Fase | Escopo | Status |
|---|---|---|
| **Fase 1** | Backend de gestão + Frontend B2B + Testes unitários | ✅ Completo |
| **Fase 2** | Páginas públicas de exibição (QR Display, Status Display) | ✅ Completo |
| **Fase 3** | QR Code Rotativo com TTL (anti-fraude) | 🔲 Pendente |
| **Fase 4** | Configurações avançadas + Form Builder | 🔲 Pendente |

## Documentação por Módulo

1. **[Arquitetura Geral](architecture.md)**
   - Stack (React/Vite, FastAPI, PostgreSQL, Redis, Docker, Nginx)
   - Fluxos B2B e B2C
   - Segurança: IDOR, anti-injection, JWT multi-tenant

2. **[Backend: Routers e API](backend_architecture.md)**
   - Endpoints implementados e padrões de autenticação
   - Injeção de dependências (Redis, DB, JWT)
   - Padrões de teste (StaticPool, dependency_overrides)

3. **[Esquema de Banco de Dados](database_schema.md)**
   - Modelos PostgreSQL (Tenant, B2BUser, QueueConfig, QueueEntry)
   - Estrutura Redis (ZSET por tenant/fila)
   - Estratégia de persistência de auditoria

4. **[Integração Frontend](frontend_integration.md)**
   - Páginas B2B (Login, Dashboard, QueueManagement)
   - Páginas públicas (B2CJoin, QRDisplay, StatusDisplay)
   - Contratos de API e eventos WebSocket

5. **[Deploy e Contêineres](deployment.md)**
   - docker-compose com backend, frontend, postgres, redis, nginx
   - Variáveis de ambiente por ambiente (dev/prod)
   - Como rodar localmente e no VPS

6. **[Roadmap — Próximos Passos](roadmap.md)**
   - Fases 3 e 4 detalhadas
   - Débitos técnicos e melhorias de infraestrutura

> **Regra de Engenharia:** Arquivos de documentação longos corrompem o contexto. Sempre que um tópico ramificar de forma complexa, um novo arquivo Markdown específico deve ser criado e referenciado aqui.
