---
title: Esquema de Banco de Dados
description: Estrutura relacional no PostgreSQL e modelo de uso do Redis na Fila Remota.
tags: [database, postgres, redis, jsonb, schema]
---

# Design de Dados Persistentes e Efêmeros

O SaaS foi projetado com uma divisão rígida entre aquilo que precisa de garantias transacionais e aquilo que precisa apenas de velocidade.

## PostgreSQL (Source of Truth Relacional)

O banco relacionará rigidamente os domínios para aplicar o bloqueio central de IDOR.

### Modelos Base de Multi-tenância (Usam UUIDs Seguros)
*   `tenants` (Estabelecimentos PIS/CNPJ): Contém nome e atuam como isolador matriz.
*   `b2b_users`: Operadores submissos a um `tenant`.
*   `queue_configs` (Filas configuradas): Estabelecimento pode ter fila "Caixa 1", "Balcão". Aqui estará o campo em `JSONB` definindo o Schema do Formulário obrigatório exigido aos clientes B2C (ex: `{"nome": "string", "documento": "string"}`).
*   `queue_history`: Consolidado morto (tempo que as pessoas ficaram) de todas ações, gravado assincronamente (Worker) puramente para cruzamento e geração de dashboards analíticos dos clientes B2B.

## Redis (Orquestrador de Filas em Tempo Real)

A natureza de uma fila é volátil: pessoas entram, desistem, ou são chamadas a todo segundo.
Escrever e reescrever as posições "1, 2, 3" e recalcular ordenação de 500 pessoas no Postgres a cada 5 segundos travaria o banco do SaaS com _Locks_.
O Redis utiliza o tipo `Sorted Set (ZSET)` onde o *score* é o *timestamp* exato de entrada do cliente final, garantindo processamento temporal O(log(N)) para descobrir em milissegundos quem é o próximo e a posição exata, mesmo sob forte estresse.

### Estrutura de Inserção na Fila Redis

#### Código: Fase de Raciocínio Python (Comentários de Segurança e Lógica)
```python
# redis_queue_reasoning.py
import time
import json

def insert_user_into_queue(redis_client, tenant_id: str, queue_id: str, user_data: dict) -> int:
    # 1. We compose a deterministic key strictly bound to the tenant to isolate data entirely.
    redis_key = f"tenant:{tenant_id}:queue:{queue_id}"
    
    # 2. Extract crucial timestamp mapping O(log(n)) sorting behavior natively in Redis.
    entry_score = time.time()
    
    # 3. Serialize user data securely without dangerous pickle dependencies (prevent deserialization exploits).
    serialized_payload = json.dumps(user_data)
    
    # 4. Atomically insert into the sorted set representing our live queue instance.
    redis_client.zadd(redis_key, {serialized_payload: entry_score})
    
    # 5. Native zrank calculates precisely the 0-indexed position immediately.
    current_position = redis_client.zrank(redis_key, serialized_payload)
    
    return current_position + 1
```

#### Código: Fase Final de Produção (Sem Comentários)
```python
# redis_queue.py
import time
import json

def insert_user_into_queue(redis_client, tenant_id: str, queue_id: str, user_data: dict) -> int:
    redis_key = f"tenant:{tenant_id}:queue:{queue_id}"
    entry_score = time.time()
    serialized_payload = json.dumps(user_data)
    
    redis_client.zadd(redis_key, {serialized_payload: entry_score})
    current_position = redis_client.zrank(redis_key, serialized_payload)
    
    return current_position + 1
```
