---
title: Arquitetura de Software e Segurança
description: Detalhamento da Stack (Flutter, FastAPI, Postgres, Redis) e defesa cibernética (IDOR/Injections).
tags: [architecture, flutter, fastapi, security, saas]
---

# Arquitetura SaaS - Fila Remota

O sistema de Fila Remota é um **SaaS Multi-tenant**, construído especificamente para suportar picos de alto tráfego originados de usuários escaneando QR Codes simultaneamente em diversos locais físicos de múltiplas empresas (Tenants).

## 1. Stack Tecnológica

*   **Frontend Unificado (Flutter Web):** 
    Tanto o Painel do Estabelecimento (B2B - Desktop/Tablet) quanto o fluxo do Cliente Final (B2C - Mobile PWA) compartilham a mesma base de código em Flutter. Utiliza-se um sistema robusto de Roteamento para separar as áreas e proteger o painel B2B sob forte autenticação.
*   **Backend (Python + FastAPI):**
    A espinha dorsal de validação. O FastAPI lidará com requisições assíncronas e hospedará WebSockets em tempo real para enviar o "Tempo Estimado / Posição" sem sobrecarregar a rede com _polling_.
*   **Banco de Dados (PostgreSQL):**
    O "Source of Truth". Todo cadastro sistêmico, autenticação de estabelecimentos e dados passados residem aqui. Modelos sensíveis usarão RLS (Row-Level Security) ou escopo explícito em queries para isolamento multi-tenant.
*   **Tratamento Efêmero (Redis):**
    O cálculo de quem está na frente de quem será inteiramente gerenciado na memória via Redis. O PostgreSQL só será notificado quando uma métrica final for consolidada, tirando o peso transacional do banco.

## 2. Foco Extremo em Segurança

As seguintes diretrizes são inegociáveis. Toda implementação do código deve segui-las rigidamente.

### A. Prevenção de IDOR (Insecure Direct Object Reference)
Em um SaaS, o pior cenário é o Cliente A conseguir gerenciar ou ver a fila do Cliente B. Todo endpoint logado exigirá um "Injetor de Tenant", garantindo que as modificações de banco forcem um contexto implícito do dono daquele recurso (`WHERE tenant_id = X`).

#### Exemplo de Defesa de IDOR (Fase de Raciocínio - Comentada)
```python
# fastapi_dependencies_reasoning.py
from fastapi import HTTPException, Header, Depends

def get_current_tenant_id(x_tenant_token: str = Header(...)) -> str:
    # 1. We aggressively validate the integrity of the JWT token.
    # 2. Extract the tenant ID bounds within it securely.
    decoded_tenant_id = decode_and_verify_jwt(x_tenant_token)
    
    # 3. If missing, we fatally halt the request before hitting the domain logic.
    if not decoded_tenant_id:
        raise HTTPException(status_code=401, detail="tenant_identity_compromised")
        
    # 4. We return the validated ID so endpoints can chain it strictly
    # in their SQL where statements ensuring explicit Isolation. 
    return decoded_tenant_id
```

#### Exemplo de Defesa de IDOR (Fase Clean/Final - Sem Comentários)
```python
# fastapi_dependencies.py
from fastapi import HTTPException, Header

def get_current_tenant_id(x_tenant_token: str = Header(...)) -> str:
    decoded_tenant_id = decode_and_verify_jwt(x_tenant_token)
    if not decoded_tenant_id:
        raise HTTPException(status_code=401, detail="tenant_identity_compromised")
    return decoded_tenant_id
```

### B. Proteção do Formulário Dinâmico (Anti-Injection/XSS)
O estabelecimento define, via Painel B2B, o esquema do seu próprio formulário (ex: "Quero nome, CPF e Idade").
Estes itens são salvos em formato `JSONB`. 
1. **Frontend (B2C):** O Flutter desenha a tela lendo o JSON, blindando nativamente contra execução de scripts embutidos nas strings do formulário via rendering (anti-XSS).
2. **Backend:** As respostas digitadas pelo cliente final B2C vão passar por uma validação estrita (Pydantic com regex whitelist) antes de serem validadas e escritas, mitigando eventuais injecções NoSQL ou comportamentos anômalos.

---
**Nota de Risco Residual:** Ao expor rotas de WebSockets não autenticadas para o cliente B2C (que apenas escaneia o QR Code anonimamente sem login), estamos abertos a potenciais exaustões de recursos se um bot mal intencionado abrir milhares de sockets num Rate Limit fraco. A infraestrutura do Nginx precisará contar com defesas rigorosas de limites de conexões simultâneas por IP.
