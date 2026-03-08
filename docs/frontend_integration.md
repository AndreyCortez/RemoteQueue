---
title: Integração Frontend (React B2B, B2C e Display Pages)
description: Páginas implementadas, fluxo de autenticação, roteamento e contratos de API.
tags: [react, typescript, vite, websocket, b2b, b2c]
---

# Integração Frontend

O frontend é uma **SPA React/Vite/TypeScript** servida pelo Nginx. Separa estritamente os domínios B2B (operadores autenticados) e B2C + Display Pages (públicas, sem auth).

## 1. Páginas Implementadas

| Rota | Componente | Auth | Público |
|---|---|---|---|
| `/login` | `Login.tsx` | ❌ | B2B |
| `/dashboard` | `Dashboard.tsx` | ✅ JWT | B2B |
| `/dashboard/queue/:id` | `QueueManagement.tsx` | ✅ JWT | B2B |
| `/join?q=<id>` | `B2CJoin.tsx` | ❌ | B2C |
| `/display/qr?q=<id>` | `QRDisplay.tsx` | ❌ | Tablet/Kiosk |
| `/display/status?q=<id>` | `StatusDisplay.tsx` | ❌ | TV/Monitor |

## 2. Autenticação B2B

`AuthContext.tsx` gerencia o token JWT no `localStorage`:
```typescript
// chave: 'rq_access_token'
const headers = getAuthHeaders(); // → { 'x-tenant-token': '<jwt>' }
```

`ProtectedRoute` redireciona para `/login` se não houver token. O token é lido no `useEffect` inicial via `axios.get('/api/v1/b2b/queues', { headers })`.

## 3. Dashboard B2B (`Dashboard.tsx`)

- Lista filas do tenant via `GET /api/v1/b2b/queues`
- Cria novas filas com `form_schema` customizado
- Clicar em fila → navega para `/dashboard/queue/:id`
- Botão "QR Code" abre modal com imagem carregada via `axios` como blob (necessário para passar `x-tenant-token` — `<img src>` não suporta headers customizados)

## 4. Gestão de Fila B2B (`QueueManagement.tsx`)

- Tabela com posição, dados do formulário, hora de entrada
- Ações: **Call Next**, **Remove**, **Reorder ▲▼**, **Clear All**
- Banner "chamando agora" exibido ao chamar o próximo
- **WebSocket**: se inscreve em `ws://.../queue/:id/ws` → refetch da lista a cada evento

## 5. Fluxo B2C (`B2CJoin.tsx`)

1. `GET /api/v1/queue/{id}` → obtém `form_schema`
2. Renderiza inputs dinamicamente com base no schema
3. `POST /api/v1/queue/join` → recebe posição na fila
4. WebSocket atualiza posição em tempo real:
   ```typescript
   ws.onmessage = (event) => {
       const msg = JSON.parse(event.data);
       if (msg.event === 'queue_member_called') {
           setPosition(prev => prev === 0 ? null : prev - 1);
       }
   };
   ```

## 6. Páginas de Display Públicas

### QRDisplay (`/display/qr?q=<id>`)
- Tela cheia para tablets/kiosks
- QR Code carregado via `GET /api/v1/queue/{id}/qrcode-public` (sem auth)
- Contador ao vivo via WebSocket
- Fundo escuro premium com gradientes

### StatusDisplay (`/display/status?q=<id>`)
- TV display com quem foi chamado (flash animado verde)
- Histórico das últimas 5 chamadas com timestamps
- Contador grande da fila
- Evento WebSocket `queue_member_called` com dados do usuário

## 7. Evento WebSocket — Contratos

```json
// Emitido quando call-next é acionado
{ "event": "queue_member_called", "called": { "nome": "João", "...": "..." } }
```

O frontend **não paga** com polling — toda atualização é push via WebSocket.
