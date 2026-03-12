---
title: Roadmap — MVP do Remote Queue
description: Definição completa de todas as fases para o MVP de produção, com status atual de cada item.
tags: [roadmap, mvp, planning]
---

# Roadmap — Remote Queue MVP

## Estado Atual

```
Fase 1 ✅  Multi-tenant B2B + B2C com Redis ZSET
Fase 2 ✅  Dashboard + Queue Management + WebSocket real-time
Fase 3 ✅  QR Code Rotativo (Anti-Fraude)
Fase 4 ✅  Rich Form Schema (labels, placeholder, pattern, required/optional)
Infra  ✅  Alembic migrations, structured JSON logging, Docker Compose, CI pipeline
Demo   ✅  Script Playwright automatizado com narração visual (demo/)
```

---

## Fase 5 — Registro e Autenticação Completa

> **Bloqueio MVP**: Hoje não existe signup. Usuários são criados via seed manual.

### 5.1 Registro de Operador B2B
- [ ] `POST /api/v1/auth/register` — cria Tenant + B2BUser em uma transação
- [ ] Frontend: página `/register` com campos: nome da empresa, email, senha, confirmar senha
- [ ] Validação de email único (409 se já existe)
- [ ] Redirect automático para `/dashboard` após registro
- [ ] Link "Criar conta" na página de login
- [ ] Testes unitários + E2E do fluxo completo

### 5.2 Verificação de Email
- [ ] Campo `email_verified: bool` no modelo `B2BUser` (migration Alembic)
- [ ] Envio de email de confirmação com token JWT (expiração 24h)
- [ ] `GET /api/v1/auth/verify-email?token=<jwt>` — marca email como verificado
- [ ] Integração com serviço de email (SendGrid / AWS SES / Resend)
- [ ] Reenviar email de verificação
- [ ] Bloquear acesso ao dashboard até verificação (ou permitir com banner de aviso)

### 5.3 Recuperação de Senha
- [ ] `POST /api/v1/auth/forgot-password` — envia email com link de reset
- [ ] `POST /api/v1/auth/reset-password` — valida token e atualiza senha
- [ ] Frontend: páginas `/forgot-password` e `/reset-password?token=<jwt>`
- [ ] Rate limiting no endpoint de forgot-password (max 5/hora por email)

### 5.4 Gestão de Operadores (Multi-Usuário por Tenant)
- [ ] `GET /api/v1/b2b/tenant/users` — listar operadores do tenant
- [ ] `POST /api/v1/b2b/tenant/invite` — convidar operador por email
- [ ] `DELETE /api/v1/b2b/tenant/users/{user_id}` — remover operador
- [ ] Roles: `admin` (tudo) vs `operator` (só gestão de fila)
- [ ] Frontend: aba "Equipe" no dashboard

---

## Fase 6 — CRUD Completo de Filas e Tenant

### 6.1 Exclusão de Fila
- [ ] `DELETE /api/v1/b2b/queues/{queue_id}` — soft delete ou hard delete com cleanup
- [ ] Limpar chave Redis associada
- [ ] Marcar `QueueEntry` como `queue_deleted`
- [ ] Botão "Excluir fila" no dashboard com confirmação
- [ ] Testes unitários + E2E

### 6.2 Perfil e Configurações do Tenant
- [ ] `GET /api/v1/b2b/tenant` — dados do tenant
- [ ] `PUT /api/v1/b2b/tenant` — editar nome, logo, configurações
- [ ] Frontend: página `/dashboard/settings` com dados da empresa
- [ ] Upload de logo (S3 ou storage local)
- [ ] Personalização de cores/branding nas telas públicas

### 6.3 Alteração de Senha
- [ ] `PUT /api/v1/auth/change-password` — requer senha atual + nova senha
- [ ] Frontend: seção no perfil do operador

---

## Fase 7 — Hardening de Segurança

### 7.1 CORS
- [ ] Adicionar `CORSMiddleware` no `api/main.py`
- [ ] Whitelist de origens configurável via env var `ALLOWED_ORIGINS`
- [ ] Bloquear `*` em produção

### 7.2 Rate Limiting
- [ ] Rate limiting por endpoint em rotas de auth (`/login`, `/register`, `/forgot-password`)
- [ ] Rate limiting por IP no join de fila (prevenir spam)
- [ ] Implementar via `slowapi` ou middleware customizado com Redis

### 7.3 Segredos e Configuração
- [ ] `SECRET_KEY` obrigatoriamente via env var (falhar startup se ausente em produção)
- [ ] Criar `.env.example` documentando todas as variáveis obrigatórias e opcionais
- [ ] Validação de `ENVIRONMENT` (development | staging | production)
- [ ] Desabilitar `/api/v1/test/*` automaticamente em produção (já parcial)

### 7.4 Sanitização de Input
- [ ] Escapar HTML em `user_data` antes de salvar (prevenir XSS via dados de fila)
- [ ] Limitar tamanho de `user_data` (max 10 campos, max 500 chars por valor)
- [ ] Validar `queue_name` (max 100 chars, sem caracteres especiais perigosos)

### 7.5 HTTPS/SSL
- [ ] Configuração Nginx com certificado SSL (Let's Encrypt via Certbot)
- [ ] Redirect HTTP → HTTPS
- [ ] Headers de segurança: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`

---

## Fase 8 — Infraestrutura de Produção

### 8.1 Deploy
- [ ] Documentação de deploy (`docs/DEPLOYMENT.md`)
- [ ] Docker Compose de produção (`docker-compose.prod.yml`) com:
  - Volumes persistentes para Postgres
  - Restart policies
  - Resource limits
  - SSL termination
- [ ] Script de backup do PostgreSQL (pg_dump agendado via cron)
- [ ] Estratégia de restore documentada

### 8.2 Monitoramento
- [ ] Endpoint `/metrics` (Prometheus-compatible)
- [ ] Integração Sentry para error tracking (backend + frontend)
- [ ] Alertas básicos: error rate > threshold, container down, disk > 90%
- [ ] Dashboard Grafana (opcional, nice-to-have)

### 8.3 CI/CD
- [x] GitHub Actions: unit tests com coverage gate (90%)
- [x] GitHub Actions: E2E Playwright contra Docker Compose
- [ ] Build e push de imagens Docker para registry (GitHub Container Registry / ECR)
- [ ] Deploy automático para staging em push para `main`
- [ ] Deploy para produção via tag/release

### 8.4 Health Checks
- [x] `GET /` retorna `{"status": "healthy"}`
- [ ] Health check detalhado: `GET /api/v1/health` — verifica Postgres + Redis connectivity
- [ ] Frontend health check (Nginx alive)

---

## Fase 9 — UX e Páginas Essenciais

### 9.1 Páginas de Erro
- [ ] Página 404 customizada (rota catch-all `*` no React Router)
- [ ] Página de erro genérica (500, rede indisponível)
- [ ] Tratamento gracioso de WebSocket desconectado (reconnect automático + banner)

### 9.2 Landing Page
- [ ] Redesign da `/` com:
  - Explicação do produto (hero section)
  - Features principais com ícones
  - CTA "Criar conta grátis" e "Fazer login"
  - Screenshot/demo do produto
- [ ] SEO básico: meta tags, Open Graph, título descritivo

### 9.3 Páginas Legais
- [ ] Termos de Uso (`/terms`)
- [ ] Política de Privacidade (`/privacy`)
- [ ] Link no footer de todas as páginas

### 9.4 Melhorias de UX
- [ ] Loading skeletons nas listas (em vez de spinner genérico)
- [ ] Feedback tátil nos botões (hover, active states já existem, verificar mobile)
- [ ] Toast/notification system unificado (em vez de alerts inline)
- [ ] Confirmação visual de ações destrutivas (modal em vez de `window.confirm`)

---

## Fase 10 — Features de Produto (Pós-MVP)

> Itens que agregam valor mas não bloqueiam o lançamento.

### 10.1 Analytics e Relatórios
- [ ] Dashboard de métricas: tempo médio na fila, pico de horário, volume diário
- [ ] Gráficos baseados em `queue_entries` (Chart.js ou Recharts)
- [ ] Exportar histórico CSV/PDF

### 10.2 Notificações
- [ ] Push notification para B2C quando está em 2ª posição
- [ ] SMS opcional (Twilio) quando cliente é chamado
- [ ] Webhook: notificar sistemas externos quando membro é chamado (`POST` configurável)

### 10.3 Multi-Fila por Display
- [ ] `QRDisplay` listando múltiplas filas do tenant no mesmo totem
- [ ] `StatusDisplay` com tabs ou grid para múltiplas filas

### 10.4 Integrações
- [ ] API pública documentada com API keys para integração de terceiros
- [ ] Zapier/Make integration triggers
- [ ] Embed widget (iframe) para sites dos clientes

### 10.5 App Nativo
- [ ] Flutter/React Native app B2C para substituir o PWA em `/join`
- [ ] Push notifications nativas
- [ ] Histórico de filas que o usuário participou

### 10.6 Internacionalização
- [ ] i18n no frontend (pt-BR, en, es)
- [ ] Idioma configurável por tenant
- [ ] Labels do schema em múltiplos idiomas

---

## Priorização para MVP

### 🔴 Bloqueadores (Fase 5-7 parcial) — Sem isso não lança

| # | Item | Fase |
|---|------|------|
| 1 | Registro de operador B2B (signup) | 5.1 |
| 2 | Exclusão de fila | 6.1 |
| 3 | CORS middleware | 7.1 |
| 4 | `.env.example` + secrets via env var | 7.3 |
| 5 | HTTPS/SSL | 7.5 |
| 6 | Documentação de deploy | 8.1 |
| 7 | Backup de banco | 8.1 |
| 8 | Página 404 | 9.1 |

### 🟡 Importantes (lançar logo depois)

| # | Item | Fase |
|---|------|------|
| 9 | Recuperação de senha | 5.3 |
| 10 | Verificação de email | 5.2 |
| 11 | Rate limiting auth | 7.2 |
| 12 | Sanitização de input | 7.4 |
| 13 | Health check detalhado | 8.4 |
| 14 | Landing page | 9.2 |
| 15 | Sentry error tracking | 8.2 |
| 16 | Perfil do tenant | 6.2 |
| 17 | Páginas legais | 9.3 |

### 🟢 Nice-to-have (roadmap pós-lançamento)

| # | Item | Fase |
|---|------|------|
| 18 | Multi-operador por tenant | 5.4 |
| 19 | Analytics/relatórios | 10.1 |
| 20 | Notificações push/SMS | 10.2 |
| 21 | Multi-fila por display | 10.3 |
| 22 | Webhook | 10.4 |
| 23 | App nativo | 10.5 |
| 24 | i18n | 10.6 |
| 25 | Deploy automático | 8.3 |

---

## Changelog

| Data | Mudança |
|------|---------|
| 2025-05 | Fases 1-2 completas (multi-tenant, dashboard, WebSocket) |
| 2025-06 | Fase 3 completa (QR rotativo anti-fraude) |
| 2025-06 | Fase 4 completa (rich form schema) |
| 2025-07 | Infra: Alembic migrations, structured logging, CI pipeline |
| 2026-03 | Demo automatizado (Playwright com narração visual) |
| 2026-03 | Roadmap reescrito para MVP de produção (Fases 5-10) |
