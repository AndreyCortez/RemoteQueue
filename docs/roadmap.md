---
title: Roadmap — Próximos Passos
description: Fases 3 e 4 detalhadas, débitos técnicos e melhorias de infraestrutura planejadas.
tags: [roadmap, next-steps, planning]
---

# Roadmap — Remote Queue

## Estado Atual

```
Fase 1 ✅  Fase 2 ✅  |  Fase 3 🔲  Fase 4 🔲  Infra 🔲
```

---

## 🔲 Fase 3 — QR Code Rotativo (Anti-Fraude)

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
- `QRDisplay.tsx` → polling periódico em `current-qr` para refrescar o QR automaticamente
- `QueueSettings.tsx` → toggle de rotação + configuração de intervalo no painel B2B

### Testes
- Unit: geração, validação e expiração do código
- E2E: join com código válido / inválido / expirado

---

## 🔲 Fase 4 — Form Builder Avançado + Configurações

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
- Migração backwards-compatible: se o valor do campo é uma `string` (formato antigo), tratar como `{ "type": string, "label": campo, "required": true }`
- `B2CJoin.tsx` → renderiza labels e placeholders do schema rico
- `QueueSettings.tsx` → interface drag-and-drop para construir o schema

---

## 🔲 Débitos Técnicos e Infraestrutura

### Alta Prioridade
- [ ] **E2E Docker**: Rodar os suites Playwright contra o Docker Compose completo
- [ ] **Rate Limiting WebSockets**: Configurar `limit_conn` no Nginx para conexões por IP
- [ ] **Alembic Migrations**: Substituir `Base.metadata.create_all` por migrações versionadas
- [ ] **Logs estruturados**: JSON logging no backend para ingestão por ferramentas de observabilidade

### Média Prioridade
- [ ] **Dashboard Analytics**: Gráficos baseados em `queue_entries` (tempo médio, pico de horário)
- [ ] **Notificações Push**: Alerta pro cliente B2C quando está em 2ª posição
- [ ] **Multi-fila por Tablet**: `QRDisplay` listando múltiplas filas do tenant
- [ ] **Pydantic V2 Upgrade**: Resolver deprecation warning do `class-based Config`

### Baixa Prioridade
- [ ] **Flutter Mobile App B2C**: App nativo para substituir o PWA em `/join`
- [ ] **Webhook**: Notificar sistemas externos quando membro é chamado
- [ ] **Exportar histórico CSV/PDF**: Dashboard de relatório do operador

---

## Guia — Como Rodar os Testes E2E

Os testes E2E requerem o stack completo via Docker:

```bash
# 1. Build e subir containers
docker compose up --build -d

# 2. Aguardar healthcheck do backend
curl http://localhost/api/v1/health

# 3. Rodar E2E
cd e2e && npx playwright test

# Suites disponíveis:
#   b2b_flow.spec.ts             → Auth completo + Dashboard
#   b2b_queue_management.spec.ts → Gestão de fila (call, remove, clear)
#   display_pages.spec.ts        → QRDisplay + StatusDisplay
```
