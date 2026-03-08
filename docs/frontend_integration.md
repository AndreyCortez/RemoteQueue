# Guia de Integração Frontend (React B2B & B2C)

A arquitetura do **Remote Queue** separa estritamente os domínios administrativos (B2B) dos públicos (B2C).

## 1. Contexto e Segurança (B2B)

Toda a gestão de filas ou criação de formulários requer que um Estabelecimento esteja logado. 

Para testes, utilize este Token Local JWT nas rotas abaixo:
```json
{
  "x-tenant-token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZW5hbnRfaWQiOiJmNjZiOWVjMyI...etc"
}
```
*Se houver `401 Unauthorized`, sua requisição foi vetada sumariamente pelo `security.py`.*

### A. Cadastrando Regras da Empresa (B2B)
**`POST /api/v1/b2b/queues`**

Ao configurar o sistema na loja, use esse endpoint. O atributo chave de poder do framework reside no campo **`form_schema`**.
Ele ditam quais perguntas dinâmicas o celular do cliente final terá que responder para entrar na fila. O FastAPI bloqueará tipos errados caso o schema dite. Ex:
```json
{
  "name": "Caixa Priority",
  "form_schema": {
    "paciente": "string",
    "idade": "integer"
  }
}
```

### B. Gerando Display do QR Code Mágico (B2B)
**`GET /api/v1/b2b/queues/{queue_id}/qrcode`**

O B2B só precisa apresentar essa imagem na tela do iPad. Um PNG é retornado como stream binário.
O usuário sacará o celular e escanerá um Deep-Link parecido com: `https://app.remotequeue.com/join?q=uuid-da-fila`.

## 2. A Jornada do Cliente Final (B2C)

O cliente chegou via QR code anônimo e quer entrar na fila.

### A. Discovery Público da Fila
**`GET /api/v1/queue/{queue_id}`**

O App React consumirá este endpoint aberto primariamente para descobrir qual é o `nome` da fila e, crucialmente, extrair o `form_schema`. A partir do Schema, a UI deve iterar renderizando dinamicamente as `<inputs>` requeridas.

### B. Pegar dados do formulário e Entrar na Fila
**`POST /api/v1/queue/join`**

Nenhum cookie ou auth B2C formal por enquanto. Mande os form inputs empacotados em `user_data` que respeite o schema acima. O backend joga o cliente atômicamente no fim do `Redis ZSET`.

### C. Atualizações Em Tempo Real c/ WebSockets
**`ws://{URL_BASE}/api/v1/queue/{queue_id}/ws`**

**Extremamente Importante**: O React do cliente DEVE instanciar este WebSocket ao entrar na fila (Nginx proxy cuidará de `wss://` para `ws://`). 
Sempre que nosso atendente B2B chamar `call-next`, este WebSocket enviará o evento assíncrono para todo mundo:
```json
{ "event": "queue_advanced" }
```
Se você receber isso em um `useEffect` Hook no React, execute a dedução otimista ou requisição REST para atualizar o `<span id="current-position">`.
