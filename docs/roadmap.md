---
title: Roadmap — Próximos Passos
description: Fases 3 e 4 detalhadas, débitos técnicos e melhorias de infraestrutura planejadas.
tags: [roadmap, next-steps, planning]
---

# Roadmap — Remote Queue

## Estado Atual

```
Fase 1 ✅  Fase 2 ✅  Fase 3 ✅  Fase 4 ✅ (backend+frontend)  |  Infra ✅ (débitos críticos)
```

---

## ✅ Fase 3 — QR Code Rotativo (Anti-Fraude)

**Problema a resolver:** Hoje o QR Code de uma fila é estático e permanente. Qualquer pessoa com o link `/join?q=<id>` pode entrar na fila sem estar fisicamente no local, inclusive dias depois.

**Solução proposta:** QR Code com código de acesso de curta duração (TTL).

### Backend

- Novos campos em `QueueConfig`:
  ```python
  qr_rotation_enabled: bool = False
  qr_rotation_interval: int = 300  # segundos (padrão 5 min)
  ```
- `QueueManager` → dois novos métodos Redis:
  ```python
  def generate_access_code(queue_id: str, ttl: int) -> str:
      # Gera token aleatório, armazena com SETEX (TTL automático)
      code = secrets.token_urlsafe(8)
      redis.setex(f"access_code:{queue_id}", ttl, code)
      return code

  def validate_access_code(queue_id: str, code: str) -> bool:
      stored = redis.get(f"access_code:{queue_id}")
      return stored == code
  ```
- `POST /queue/join` → valida `access_code` quando rotação está ativa
- Endpoint público `GET /api/v1/queue/{id}/current-qr` → retorna código atual (para os displays)

### Frontend
- [x] `QRDisplay.tsx` → polling automático via `setTimeout` quando `rotation_enabled=true`
- [x] `QueueManagement.tsx` → modal Settings com toggle `#qr-rotation-toggle` + select de intervalo + `#save-settings-btn`

### Testes
- [x] Unit: geração, validação e expiração do código (`tests/api/test_queue.py`)
- [x] E2E: join com código válido / inválido / expirado + toggle settings (`e2e/tests/qr_rotation.spec.ts`)

---

## ✅ Fase 4 — Form Builder Avançado + Configurações

**Problema a resolver:** O `form_schema` atual é simplificado (`{"campo": "tipo"}`). Não suporta labels customizados, placeholders, campos obrigatórios/opcionais, ou validações específicas.

**Solução proposta:** Schema rico com metadados por campo.

### Novo formato `form_schema`

```json
{
  "nome": {
    "type": "string",
    "label": "Nome completo",
    "placeholder": "Ex: João Silva",
    "required": true
  },
  "cpf": {
    "type": "string",
    "label": "CPF",
    "placeholder": "000.000.000-00",
    "required": false,
    "pattern": "^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$"
  }
}
```

### Compatibilidade
- [x] Migração backwards-compatible em `validate_payload_against_schema` (`api/routers/queue.py`)
- [x] `B2CJoin.tsx` → renderiza `label`, `placeholder`, `required` do schema rico; campos opcionais marcados e não enviados quando vazios
- [x] Unit tests: schema rico, campos opcionais, pattern regex, backwards compat (`tests/api/test_queue.py`)
- [x] E2E tests via API + labels no frontend (`e2e/tests/display_pages.spec.ts`)
- [ ] `QueueSettings.tsx` → interface drag-and-drop para construir o schema (Fase 4 avançada, futuro)

---

## 🔲 Débitos Técnicos e Infraestrutura

### Alta Prioridade
- [x] **E2E Docker**: Rodar os suites Playwright contra o Docker Compose completo
- [x] **`.gitignore` e2e/test-results/**: Adicionado `e2e/test-results/` e `e2e/playwright-report/` ao `.gitignore`
- [x] **Pydantic V2 Upgrade**: `api/config.py` migrado de `class Config` para `SettingsConfigDict`
- [x] **Rate Limiting WebSockets**: `limit_conn_zone` + `limit_conn ws_limit 20` já configurados em `frontend/nginx.conf`
- [x] **Alembic Migrations**: `Base.metadata.create_all` substituído por migrações versionadas (`alembic upgrade head` no startup do Docker)
- [x] **Logs estruturados**: `JsonFormatter` + `RequestLoggingMiddleware` com `trace_id` por request (`api/logging_config.py`)

### Média Prioridade
- [x] **Cobertura de testes**: `test_seed.py` 100% (era 43%) — global 91% com 45 testes passando
- [ ] **Dashboard Analytics**: Gráficos baseados em `queue_entries` (tempo médio, pico de horário)
- [ ] **Notificações Push**: Alerta pro cliente B2C quando está em 2ª posição
- [ ] **Multi-fila por Tablet**: `QRDisplay` listando múltiplas filas do tenant

### Baixa Prioridade
- [ ] **Flutter Mobile App B2C**: App nativo para substituir o PWA em `/join`
- [ ] **Webhook**: Notificar sistemas externos quando membro é chamado
- [ ] **Exportar histórico CSV/PDF**: Dashboard de relatório do operador

---


