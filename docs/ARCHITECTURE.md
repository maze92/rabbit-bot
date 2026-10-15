# .rabbit – Visão geral de arquitetura

Esta nota resume a arquitetura atual do bot, para facilitar manutenção e evolução a longo prazo.

## Stack principal

- **Runtime:** Node.js 20.x
- **Bot Discord:** discord.js v14
- **HTTP API / Dashboard:** Express + Socket.IO
- **Base de dados:** MongoDB (mongoose)
- **Infra:** Koyeb (porta 8000, Dockerfile próprio)
- **Autenticação da dashboard:** admin/password via variáveis de ambiente + sessões JWT

## Estrutura de pastas (nível alto)

- `src/`
  - `index.js` – ponto de entrada. Liga ao Mongo, faz login no Discord, arranca a dashboard e os sistemas de background (maintenance, GameNews).
  - `dashboard.js` – servidor Express + Socket.IO. Define as rotas `/api/*` usadas pela dashboard e carrega o HTML/JS/CSS no browser.
  - `bot.js` – criação e configuração do cliente Discord.
  - `events/` – handlers de eventos do Discord (mensagens, membros, reações, voz, etc.).
  - `models/` – schemas Mongoose (infrações, tickets, game news, etc.).
  - `systems/`
    - `errorGuard.js` – captura exceções não tratadas e logs amigáveis.
    - `status.js` – flags de estado (Mongo ligado, Discord ready, GameNews a correr) usadas pela dashboard.
    - `maintenance.js` – tarefas periódicas (limpeza de logs/infrações antigos, etc.).
    - `gamenews.js` – ciclo de RSS → mensagens no Discord + estado para a dashboard.
    - `logger.js` – registo de ações de moderação (Warn/Mute/Kick/Ban, etc.) em Mongo e na cache de logs da dashboard.
    - outros ficheiros utilitários.

- `public/`
  - `index.html` – shell da dashboard.
  - `css/` – estilos da dashboard.
  - `js/`
    - `dashboard.js` – core do front-end (state global, helpers `apiGet/apiPost`, i18n, gestão de tabs).
    - `dashboard.users.js` – lógica da tab Utilizadores (listagem, histórico, ações).
    - `dashboard.moderation.js` – lógica da tab Moderação (lista de logs, filtros, resumo).
    - `dashboard.gamenews.js` – lógica da tab GameNews.
  - `locales/`
    - `pt.js` / `en.js` – textos para i18n, usados pelo helper `t()` no front-end.

- `config/`
  - `defaultConfig.js` – defaults de configuração (inclui dashboard, GameNews, etc.).

- `Dockerfile`
  - build e arranque do container (porta 8000, `npm install` e `npm start`).

## Fluxo de dados – Moderação / Logs

1. Um comando de moderação é executado (slash ou prefix).
2. O handler chama o `logger` para:
   - guardar o evento na coleção de logs (Mongo);
   - empurrar uma entrada para a cache em memória (últimos ~200 logs) exposta à dashboard.
3. A dashboard obtém os logs via `/api/logs` e renderiza no front-end com `createLogRow()` + `renderLogs()`.

Benefícios:
- A dashboard é rápida (lê da cache de memória).
- Em caso de erro na cache, é possível cair para Mongo sem perder histórico.

## Fluxo de dados – Utilizadores

1. Front-end chama `/api/guilds/:guildId/users`.
2. O backend utiliza `_client.guilds.cache` para obter o `guild`.
3. Tenta preencher/atualizar `guild.members.cache` (com proteções contra spam ao gateway).
4. Constrói uma lista simplificada de utilizadores (id, username, tag, roles, bot/human, joinDate).
5. A tab Utilizadores renderiza esta lista e, ao clicar num utilizador, chama `/api/guilds/:guildId/users/:userId/history` para:
   - infrações recentes;
   - contagem por tipo de infração;
   - tickets associados.

## Fluxo de dados – GameNews

1. `systems/gamenews.js` corre em ciclo:
   - lê configuração (feeds ativos, canais de destino, idioma);
   - faz fetch aos RSS feeds configurados;
   - deduplica notícias já enviadas;
   - envia mensagens para o canal de GameNews no Discord;
   - atualiza o estado (última execução, estado on/off, erros) em memória.
2. A dashboard lê esse estado via API e apresenta:
   - badge de estado (ativo/inativo/erro);
   - feeds configurados;
   - botões para ativar/desativar e guardar alterações.

## Estados e saúde do sistema

- `status.js` expõe funções para:
  - `setMongoConnected(bool)`
  - `setDiscordReady(bool)`
  - `setGameNewsRunning(bool)`
  - `getStatus()` – usado pela rota `/health` para a dashboard.
- A página principal faz polling periódico à API de health e mostra badges de estado (Mongo, Discord, GameNews, Dashboard).

## Linhas gerais para evolução futura

- **Separar módulos de dashboard**:
  - No futuro, `src/dashboard.js` pode ser dividido em:
    - `dashboard/routes/users.js`
    - `dashboard/routes/moderation.js`
    - `dashboard/routes/gamenews.js`
    - etc.
  - Isto facilita testes unitários por domínio (users, logs, gamenews).

- **Testes automatizados**:
  - Adicionar testes de unidade aos serviços puros:
    - `systems/logger`
    - `systems/gamenews` (parsing de RSS, deduplicação)
    - `maintenance` (regras de limpeza).
  - Adicionar testes de integração para algumas rotas da API com supertest.

- **Segurança / hardening**:
  - Manter validação rigorosa de ids (`sanitizeId`).
  - Centralizar o middleware de autenticação da dashboard (JWT + origem) num único módulo reutilizável.
  - Limitar o tamanho de respostas em endpoints sensíveis (`/api/guilds/:guildId/users`) com paginação no futuro.

Esta nota não altera comportamento nenhum em runtime – serve apenas como mapa mental para que tu (ou qualquer outra pessoa) consigas navegar e evoluir o projeto com confiança.
