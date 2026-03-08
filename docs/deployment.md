---
title: Deployment & Containerização
description: Guia de implantação segura da Fila Remota utilizando orquestração local com Docker.
tags: [deployment, docker, compose, networking]
---

# Padrões de Virtualização e Entrega Contínua

O SaaS multi-tenant emprega a filosofia estrita de configuração declarativa. O sistema jamais deve exigir configuração residual na máquina Host (VPS) para funcionar. 

## Docker Compose: A Planta Baixa da Infraestrutura

O ambiente de Produção e o ambiente de Staging espelham as mesmas estruturas base. A arquitetura exige no mínimo as seguintes gavetas de isolamento (Containers):
1.  **FastAPI Backend** (Aplicação Python Exposta em rede restrita).
2.  **Flutter Web Nginx** (Asset estático compilado sendo hospedado passivamente).
3.  **Postgres** (Persistência Mapeada para um Disco real).
4.  **Redis** (In-Memory, estritamente trancado via networking de docker bridge).

### Restrição de Networking Interno (Segurança)
Bancos de Dados não podem, em hipótese alguma, ter suas portas mapeadas publicamente para o Host (ex: `0.0.0.0:5432`). O tráfego ocorrerá fundamentalmente apenas dentro do espectro Docker isolado via ponte.

#### Configuração de Deploy - Fase de Raciocínio (Comentada)
```yaml
# docker-compose.reasoning.yml
version: "3.8"
services:
  api:
    image: remote_queue_api:latest
    # 1. API talks to Postgres using explicit container hostnames, resolving inside the bridge.
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres_db:5432/saas
    # 2. We only expose the API port 8000 externally for NGINX/Traefik reverse proxy ingestion.
    ports:
      - "8000:8000"
      
  postgres_db:
    image: postgres:15-alpine
    # 3. SECURITY: Deliberately excluding 'ports' configuration physically blocks 
    # the internet from probing port 5432 natively. Absolutely critical for databases.
    environment:
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=saas
    # 4. Hard mount the disk volume preventing catastrophic wipe during upgrades.
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

#### Configuração de Deploy - Produção Clean (Sem Comentários)
```yaml
# docker-compose.yml
version: "3.8"
services:
  api:
    image: remote_queue_api:latest
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres_db:5432/saas
    ports:
      - "8000:8000"
      
  postgres_db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=saas
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```
