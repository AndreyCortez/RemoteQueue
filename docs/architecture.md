---
title: Arquitetura Geral — Remote Queue SaaS
description: Stack tecnológica, fluxos B2B/B2C, segurança multi-tenant e estrutura de deployment.
tags: [architecture, fastapi, react, security, saas, docker]
---

# Arquitetura — Remote Queue SaaS

Sistema **multi-tenant** baseado em QR Code para gestão de filas físicas.

## 1. Stack Tecnológica

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **Frontend** | React 18 + Vite + TypeScript | Painel B2B, join B2C, displays públicos |
| **Backend** | Python 3.12 + FastAPI | API REST + WebSockets assíncronos |
| **Banco Relacional** | PostgreSQL 15 | Source of truth: tenants, usuários, configurações, auditoria |
| **Fila em Memória** | Redis (ZSET) | Fila efêmera em tempo real, posicionamento O(log N) |
| **Proxy / SSL** | Nginx | Roteamento `/api/v1 → backend`, `/→ frontend`, `wss://` |
| **Infra** | Docker Compose | Ambiente reproduzível: backend, frontend, postgres, redis, nginx |

## 2. Separação de Domínios

```
Domínio B2B (operadores autenticados)     Domínio B2C (clientes finais — anônimos)
──────────────────────────────────────    ───────────────────────────────────────
/login          → Login JWT               /join?q=<id>   → Formulário dinâmico
/dashboard      → Listar filas, criar     /display/qr    → QR Code fullscreen (tablet)
/dashboard/     → Gestão de fila           /display/status→ Status TV (quem foi chamado)
  queue/:id       (call-next, remove…)
```

## 3. Fluxo B2B (Operador)

1. Operador faz login → recebe JWT com `tenant_id` embutido
2. Cria filas com `form_schema` customizado (JSON: campo→tipo)
3. Gera QR Code da fila → exibe em tablet/kiosk (`/display/qr`)
4. Monitora e gerencia fila em `/dashboard/queue/:id`:
   - Vê lista de membros em tempo real (WebSocket)
   - Chama próximo → broadcast `queue_member_called` via WebSocket
   - Remove, reordena, limpa fila

## 4. Fluxo B2C (Cliente Final)

1. Cliente escaneia QR → abre `/join?q=<queue_id>` no celular
2. Frontend busca `form_schema` e renderiza inputs dinamicamente
3. Cliente preenche e entra (`POST /queue/join`) → posição retornada
4. WebSocket atualiza posição em tempo real até ser chamado

## 5. Segurança Multi-Tenant

### 5.1 Prevenção de IDOR
Todo endpoint B2B usa `Depends(get_current_tenant_id)` que:
1. Extrai e valida o JWT do header `x-tenant-token`
2. Retorna o `tenant_id` verificado
3. Endpoints filtram queries com `WHERE tenant_id = :tenant_id`

```python
# api/dependencies/security.py
def get_current_tenant_id(x_tenant_token: str = Header(...)) -> str:
    payload = jwt.decode(x_tenant_token, settings.tenant_secret_key, algorithms=[settings.algorithm])
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="tenant_identity_compromised")
    return tenant_id
```

### 5.2 Anti-Injection no Form Schema
- Backend valida `user_data` contra `form_schema` usando tipagem estrita
- Nenhum eval/exec — dados são serializados via `json.dumps` com tipos primitivos
- Formulários dinâmicos renderizados via React (XSS nativo bloqueado pelo DOM)

### 5.3 Risco Residual: Rate Limit em WebSockets
WebSockets B2C são públicos (sem auth). O Nginx deve configurar:
```nginx
limit_conn_zone $binary_remote_addr zone=ws_limit:10m;
limit_conn ws_limit 20;
```
Isso limita 20 conexões simultâneas por IP, bloqueando bots de exaustão.
