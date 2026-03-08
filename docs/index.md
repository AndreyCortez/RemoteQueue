---
title: Índice da Documentação - SaaS Fila Remota
description: Mapa central de toda a arquitetura e diretrizes de engenharia do projeto.
tags: [index, saas, fila, remote-queue]
---

# Remote Queue SaaS - Documentação Oficial

Bem-vindo à documentação oficial do nosso sistema de fila remota multi-tenant. O objetivo desta estrutura é permitir rápida absorção do contexto do projeto por novos engenheiros e agentes de IA, mantendo um foco absoluto em **escalabilidade, isolamento de dados (Security First) e reprodutibilidade**.

## Módulos da Arquitetura

Navegue pelos módulos abaixo para entender cada pilar do nosso sistema:

1.  **[Visão Arquitetural](architecture.md)**
    *   Stack Tecnológica (Flutter, FastAPI, PostgreSQL, Redis).
    *   Fluxos de dados B2B (Painel) e B2C (QR Code).
    *   Diretrizes de Segurança e Multi-tenância (Prevenção de IDOR e Injeções).

2.  **[Esquema de Banco de Dados](database_schema.md)** *(A ser implementado)*
    *   Estrutura relacional no PostgreSQL com foco em isolamento de *Tenants*.
    *   Como armazenar as configurações dinâmicas dos formulários em `JSONB`.
    *   Modelagem da fila efêmera utilizando Redis.

3.  **[Estratégia de Deploy e Contêineres](deployment.md)** *(A ser implementado)*
    *   Configurações do `docker-compose`.
    *   Orquestração de serviços.

> **Regra de Engenharia:**
> Arquivos de documentação muito longos corrompem o contexto. Sempre que um tópico ramificar de forma complexa, um novo arquivo Markdown específico deve ser criado e referenciado recursivamente aqui.
