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

## Fase 5 — Estimativa Dinâmica de Espera

Dar ao cliente uma previsão de tempo de espera baseada no ritmo real de atendimento, atualizada em tempo real conforme a fila avança.

### 5.1 Coleta de Dados de Cadência

- [ ] Registrar `called_at` (Unix timestamp) em `QueueEntry` a cada `call-next` bem-sucedido
- [ ] Calcular intervalo entre chamadas consecutivas para cada fila (cadência por fila, não global)
- [ ] Persistir rolling average em Redis: `tenant:{id}:queue:{id}:avg_interval` com janela dos últimos 10 atendimentos
- [ ] Ao iniciar o servidor, recalcular médias existentes a partir do histórico de `QueueEntry`

### 5.2 API de Estimativa

- [ ] Adicionar campo `estimated_wait_seconds: int | null` ao response de `GET /api/v1/queue/{queue_id}/status`
  - `null` = dados insuficientes (menos de 3 atendimentos registrados)
  - Fórmula: `position × avg_interval_seconds`
- [ ] Incluir `sample_size: int` para o frontend saber o nível de confiança da estimativa
- [ ] Incluir `estimated_wait_seconds` nos eventos WebSocket de `queue_updated` e `queue_member_called`

### 5.3 Frontend — B2CJoin (Tela do Cliente)

- [ ] Exibir estimativa abaixo do número de posição quando `estimated_wait_seconds !== null`
  - Formatar de forma humana: "~3 min", "~1h 10min"
  - Exibir "Calculando..." quando `sample_size < 3`
- [ ] Atualizar estimativa via WebSocket sem reload de página
- [ ] Não exibir estimativa quando posição = 0 ("Você é o próximo")

### 5.4 Frontend — StatusDisplay (Tela da TV)

- [ ] Adicionar bloco de estimativa média no painel direito ("Tempo médio de atendimento: ~8 min")
- [ ] Atualizar via WebSocket junto com o restante dos dados

### 5.5 Edge Cases

- [ ] Fila com 0 chamadas: ocultar estimativa completamente
- [ ] Outliers (atendimento muito longo): usar mediana em vez de média para evitar distorção
- [ ] Fila parada por longo período: expirar a estimativa se nenhuma chamada ocorreu nas últimas 2 horas (retornar `null`)

---

## Fase 5B — Portal Administrativo Interno (Superadmin)

Interface interna da Remote Queue para registrar, monitorar e gerenciar todos os negócios clientes (tenants) da plataforma.

### 5B.1 Modelo de Autenticação Superadmin

- [ ] Adicionar coluna `is_superadmin: bool` em `B2BUser` (ou criar modelo `AdminUser` separado)
- [ ] Novo claim `role: "superadmin"` no JWT emitido para admins
- [ ] Dependency `require_superadmin` no FastAPI — qualquer rota `/api/v1/admin/*` exige esse claim
- [ ] Login separado em `POST /api/v1/admin/auth/login`
- [ ] Script CLI para criar o primeiro superadmin (`scripts/create_admin.py`)

### 5B.2 API de Gestão de Tenants

- [ ] `GET /api/v1/admin/tenants` — listar todos os tenants com métricas básicas:
  - Total de filas, total de membros ativos, data de criação, último acesso
- [ ] `GET /api/v1/admin/tenants/{tenant_id}` — detalhes completos:
  - Filas, configurações QR, histórico de atividade (calls por dia últimos 30 dias)
- [ ] `POST /api/v1/admin/tenants` — criar novo tenant + usuário operador inicial
- [ ] `PUT /api/v1/admin/tenants/{tenant_id}` — editar nome, plano, configurações
- [ ] `POST /api/v1/admin/tenants/{tenant_id}/suspend` — suspender acesso (login bloqueado, filas ativas pausadas)
- [ ] `DELETE /api/v1/admin/tenants/{tenant_id}` — exclusão com cleanup completo (Redis + Postgres)

### 5B.3 API de Métricas Globais

- [ ] `GET /api/v1/admin/stats` — dashboard de números gerais:
  - Total tenants ativos / suspensos
  - Total de chamadas hoje / esta semana / este mês
  - Tenants mais ativos (top 10 por volume)
  - Filas com maior fluxo agora (em tempo real)

### 5B.4 Frontend — Portal Admin

- [ ] Rota protegida `/admin/*` com `AdminProtectedRoute` separado do `ProtectedRoute` B2B
- [ ] `/admin/login` — tela de login exclusiva para superadmins
- [ ] `/admin` — dashboard com métricas globais (cards de totais, gráfico de atividade)
- [ ] `/admin/tenants` — tabela paginada de tenants com filtro por nome/status e ações inline (suspender, excluir)
- [ ] `/admin/tenants/:id` — página de detalhe do tenant:
  - Dados cadastrais editáveis
  - Lista de filas ativas com tamanho atual
  - Gráfico de chamadas por dia (últimos 30 dias)
  - Botões de suspender / reativar / excluir
- [ ] Tema visual diferenciado (ex.: sidebar escura, badge "Admin") para deixar claro que é o painel interno

### 5B.5 Segurança

- [ ] Todas as rotas `/admin/*` bloqueadas por RBAC — 403 se JWT não tiver `role: superadmin`
- [ ] Logs de auditoria para ações destrutivas (suspender, excluir): gravar `admin_user_id`, `action`, `target_tenant_id`, `timestamp` em tabela `AdminAuditLog`
- [ ] Rate limiting agressivo no `/admin/auth/login` (5 tentativas / 10 min por IP)

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
