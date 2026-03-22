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
Fase 4B ✅ Form Builder avançado (Schema V2, tipos ricos, branding)
Fase 5 ✅  Estimativa Dinâmica de Espera (mediana de intervalos, WebSocket real-time)
Fase 5B ✅ Portal Administrativo Interno (superadmin, CRUD tenants, métricas globais)
Infra  ✅  Alembic migrations, structured JSON logging, Docker Compose, CI pipeline
Demo   ✅  Script Playwright automatizado com narração visual (demo/)
```

---

## Fase 4B — Form Builder Avançado + Branding ✅

Migração do schema de formulário para formato V2 ordenado, novos tipos de campo, builder estilo Google Forms e controle de branding por tenant.

### 4B.1 Backend — Schema V2 + Validação ✅

- [x] Schema V2: array ordenado com discriminador `kind` (field/section), compatível com formato legado
- [x] 7 tipos de campo: `string`, `integer`, `boolean`, `cpf`, `date`, `select`, `poll`
- [x] Validação CPF com regex + dígito verificador (módulo 11)
- [x] Validação de payload B2C contra schema V2 (select/poll checam opções válidas)
- [x] Validação de schema na criação/atualização de fila (rejeita schemas malformados)
- [x] Módulo centralizado `api/schemas/form_schema.py`

### 4B.2 Infraestrutura de Branding ✅

- [x] Coluna `branding` (JSON) no modelo `Tenant` + migration Alembic
- [x] `GET /api/v1/b2b/queues/branding` — ler branding do tenant
- [x] `PUT /api/v1/b2b/queues/branding` — atualizar branding (company_name, logo_url, primary_color, background_color, accent_color)
- [x] `GET /api/v1/queue/{queue_id}` retorna branding do tenant junto com dados da fila

### 4B.3 Frontend — Renderer V2 ✅

- [x] Tipos TS e normalizador `normalizeSchema()` em `frontend/src/types/formSchema.ts`
- [x] 8 componentes de campo: StringField, IntegerField, BooleanField, CpfField, DateField, SelectField, PollField, SectionHeader
- [x] `FieldRenderer` switch component reutilizado em B2CJoin e FormPreview
- [x] B2CJoin atualizado para V2 com branding aplicado (logo, cores, nome da empresa)
- [x] QRDisplay e StatusDisplay atualizados com branding do tenant (logo, nome, cores de fundo/destaque)

### 4B.4 Frontend — Form Builder UI ✅

- [x] FormBuilder: lista ordenada com mover cima/baixo, deletar, adicionar campo por tipo ou seção
- [x] FieldConfig: edição inline de label, tipo, placeholder, key (auto-slug), required, opções (select/poll)
- [x] FormPreview: preview ao vivo do formulário com branding
- [x] Dashboard integrado com FormBuilder + preview lado a lado
- [x] QueueManagement com abas (QR Code / Formulário / Marca) para edição completa

### 4B.5 Frontend — Branding UI ✅

- [x] BrandingConfig: campos para nome, logo (com preview), color pickers (principal, fundo, destaque)
- [x] Preview visual com faixa de cores
- [x] Integrado na aba "Marca" do QueueManagement

### 4B.6 Testes ✅

- [x] 17 testes backend para schema V2 (todos os tipos, CPF válido/inválido, select/poll, seções, compatibilidade legada, branding)
- [x] 7 testes para tenant_setup (criação/update V2, branding CRUD, atualização parcial)
- [x] Todos os 90 testes passam (66 existentes + 24 novos)

---

## Fase 5 — Estimativa Dinâmica de Espera ✅

Dar ao cliente uma previsão de tempo de espera baseada no ritmo real de atendimento, atualizada em tempo real conforme a fila avança.

### 5.1 Coleta de Dados de Cadência ✅

- [x] Registrar `called_at` (Unix timestamp) em `QueueEntry` a cada `call-next` bem-sucedido
- [x] Calcular intervalo entre chamadas consecutivas para cada fila (cadência por fila, não global)
- [x] Persistir rolling window em Redis list: `tenant:{id}:queue:{id}:intervals` com últimos 20 timestamps
- [x] Usar mediana dos intervalos para resistência a outliers

### 5.2 API de Estimativa ✅

- [x] Adicionar campo `estimated_wait_seconds: int | null` ao response de `GET /api/v1/queue/{queue_id}/status`
  - `null` = dados insuficientes (menos de 3 atendimentos registrados)
  - Fórmula: `position × median_interval_seconds`
- [x] Incluir `sample_size: int` para o frontend saber o nível de confiança da estimativa
- [x] Incluir `estimated_wait_seconds` nos eventos WebSocket de `queue_updated` e `queue_member_called`

### 5.3 Frontend — B2CJoin (Tela do Cliente) ✅

- [x] Exibir estimativa abaixo do número de posição quando `estimated_wait_seconds !== null`
  - Formatar de forma humana: "~3 min", "~1h 10min"
  - Exibir "Calculando..." quando `sample_size < 3`
- [x] Atualizar estimativa via WebSocket sem reload de página
- [x] Não exibir estimativa quando posição = 0 ("Você é o próximo")

### 5.4 Frontend — StatusDisplay (Tela da TV) ✅

- [x] Adicionar bloco de estimativa média no painel direito ("Tempo médio de espera: ~8 min")
- [x] Atualizar via WebSocket junto com o restante dos dados

### 5.5 Edge Cases ✅

- [x] Fila com 0 chamadas: ocultar estimativa completamente
- [x] Outliers (atendimento muito longo): usar mediana em vez de média para evitar distorção
- [x] Fila parada por longo período: expirar a estimativa se nenhuma chamada ocorreu nas últimas 2 horas (intervalos > 7200s filtrados)

---

## Fase 5B — Portal Administrativo Interno (Superadmin) ✅

Interface interna da Remote Queue para registrar, monitorar e gerenciar todos os negócios clientes (tenants) da plataforma.

### 5B.1 Modelo de Autenticação Superadmin ✅

- [x] Adicionar coluna `is_superadmin: bool` em `B2BUser`
- [x] Novo claim `role: "superadmin"` no JWT emitido para admins
- [x] Dependency `get_current_admin_user_id` — qualquer rota `/api/v1/admin/*` exige role=superadmin
- [x] Login separado em `POST /api/v1/admin/auth/login`
- [x] Script CLI para criar o primeiro superadmin (`scripts/create_admin.py`)

### 5B.2 API de Gestão de Tenants ✅

- [x] `GET /api/v1/admin/tenants` — lista todos os tenants com métricas (filas, membros ativos, criação)
- [x] `GET /api/v1/admin/tenants/{tenant_id}` — detalhes completos (filas, calls/dia últimos 30 dias)
- [x] `POST /api/v1/admin/tenants` — cria novo tenant + usuário operador inicial
- [x] `PUT /api/v1/admin/tenants/{tenant_id}` — editar nome
- [x] `POST /api/v1/admin/tenants/{tenant_id}/suspend` — toggle suspenso/ativo (login B2B bloqueado)
- [x] `DELETE /api/v1/admin/tenants/{tenant_id}` — exclusão com cleanup completo (Redis + Postgres)

### 5B.3 API de Métricas Globais ✅

- [x] `GET /api/v1/admin/stats` — dashboard de números gerais:
  - Total tenants ativos / suspensos
  - Total de chamadas hoje / esta semana / este mês
  - Tenants mais ativos (top 10 por volume este mês)
  - Filas com maior fluxo agora (em tempo real via Redis)

### 5B.4 Frontend — Portal Admin ✅

- [x] Rota protegida `/admin/*` com `AdminProtectedRoute` + `AdminAuthContext` separado do B2B
- [x] `/admin/login` — tela de login exclusiva para superadmins
- [x] `/admin` — dashboard com métricas globais (cards de totais, top tenants, filas ativas)
- [x] `/admin/tenants` — tabela de tenants com filtro por nome e ações inline (suspender, excluir, criar)
- [x] `/admin/tenants/:id` — detalhe do tenant:
  - Nome editável, status suspenso/ativo
  - Lista de filas com membros ativos
  - Mini-gráfico de barras de chamadas por dia (30d)
  - Botões suspender / reativar / excluir com confirmação
- [x] Tema visual diferenciado: sidebar escura, badge "ADMIN", paleta azul escuro

### 5B.5 Segurança ✅

- [x] Todas as rotas `/admin/*` bloqueadas por RBAC — 403 se JWT não tiver `role: superadmin`
- [x] Logs de auditoria (`AdminAuditLog`) para ações destrutivas: `admin_user_id`, `action`, `target_tenant_id`, `timestamp`
- [x] Rate limiting no `/admin/auth/login`: 5 tentativas / 10 min por username (Redis)

---
