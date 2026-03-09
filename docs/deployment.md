---
title: Deployment & Containerização
description: Guia de implantação segura da Fila Remota utilizando orquestração local com Docker.
tags: [deployment, docker, compose, networking]
---

# Padrões de Virtualização e Entrega Contínua

O SaaS multi-tenant emprega a filosofia estrita de configuração declarativa. O sistema jamais deve exigir configuração residual na máquina Host (VPS) para funcionar. 

## Docker Compose: A Planta Baixa da Infraestrutura

A arquitetura exige os seguintes containers operando na mesma rede virtual privada (`bridge`):
1. **FastAPI Backend (`remotequeue-backend`)**: Aplicação Python 3.12 (slim) não exposta diretamente.
2. **React SPA + Nginx (`remotequeue-frontend`)**: Compila a interface B2B e B2C. Serve estáticos e atua como **Reverse Proxy**. Todas as rotas `/api/*` e conexões WebSockets são repassadas para o Backend, garantindo isolamento.
3. **Postgres**: Driver de dados persistentes.
4. **Redis**: Cache In-Memory temporário para filas e pub/sub.

### Scripts de Desenvolvimento (`manual_test.sh`)

Para simular o ambiente rigorosamente como em Produção, estruturamos o script `scripts/manual_test.sh`.

Este é o padrão de deploy para testes locais:
1. Destrói volumes e recursos residuais (`docker compose down -v`).
2. Faz o build rigoroso dos serviços locais (FastAPI e Vite/React) do zero.
3. Aguarda por dependências e faz o seeding automático (`/api/v1/test/seed-b2b`) para provisionamento de dados teste sem cliques manuais.
4. Entrega a aplicação completamente pronta nos endereços locais (`localhost:3000` / `localhost:8001`).

### Restrição de Networking Interno (Segurança)

Bancos de Dados não podem, em hipótese alguma, ter suas portas mapeadas publicamente para o Host (ex: `0.0.0.0:5432`). O tráfego ocorrerá fundamentalmente apenas dentro do espectro Docker isolado via ponte. Apenas os containers de aplicação e proxy conversam com os bancos.

### Estrutura do Proxy (`frontend/nginx.conf`)

Para resolver problemas de CORS e SPA routing (Fallback 404), o contêiner frontend possui um arquivo `nginx.conf` fixo. Ele instrui rotas como `/api` a usarem `proxy_pass http://backend:8000;`, inclusive herdando os headers necessários de "Upgrade" para sustentar WebSockets em produção adequadamente.
