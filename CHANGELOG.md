## 1.2.9
- Dashboard (CORS): origem de produção ajustada para `https://rabbit-bot.koyeb.app` (remove legado `ozark-bot.koyeb.app`).
- Moderação (Dashboard): nova secção **Casos** (lista + detalhe) usando `/api/cases` e `/api/case`.
- Frontend: correção de bug de sintaxe no editor de utilizadores da dashboard (allowedGuildIds reset).
- Cache bust: versão dos assets atualizada para evitar servir JS/CSS antigos.

## 1.2.8
- Infractions: schema alinhado com o serviço (caseId, source, userTag/executorTag) + índices úteis (inclui unique por guild+caseId).
- Cases API: pesquisa e filtros corrigidos para usar campos reais (reason/tags/ids/type/source/caseId).
- Case API: usa tags guardadas (snapshot) e só faz fetch ao Discord quando necessário.
- Logs API: validação Zod agora aceita `guildId` opcional (evita 400 em estados “sem servidor selecionado”).
- Dashboard (Moderação): paginação do painel de tickets não permite “cliques mortos” (prev/next desativados conforme total).

## 1.2.7
- Moderação (Server Insights): ranges ajustados para 7d/14d/30d (mantém compatibilidade com 24h/1y se algum cliente antigo usar).
- Moderação (Server Insights): métricas passam a usar **Infractions** como fonte de verdade (WARN/MUTE), sem parsing frágil de logs.
- Moderação (Server Insights): `stats` estável (totalActions, warns, mutes) + cache curto (45s) por guild/range.
- Segurança: `GET /api/mod/overview` agora valida `guildId` via guild allow-list (quando configurada).

## 1.2.6
- Segurança: guardas de permissões (RBAC) e de acesso por servidor (guild allow-list) aplicados em Case/Audit/Admin/TempVoice/Users history.
- Tickets: validação de comprimento da resposta (frontend) + chave i18n para erro de mensagem demasiado longa.
- Backend: removida duplicação de verificação NO_GUILD_ACCESS no endpoint de reply de tickets.

## 1.2.5
- GameNews: validação inline no editor (URL/canal) e botões desativados quando inválido.
- GameNews: dirty-state por feed (badge "Alterações" e aviso discreto ao trocar de feed).
- GameNews: badge de erro quando há lastError no estado do feed.

## 1.2.4
- Frontend: validação inline em Config e Trust (erros por campo, sem alterar layout).
- Trust: status explícito quando um preset é aplicado (não guardado).
- Config: limpeza automática de erros inline ao editar campos.

# Changelog

Todas as alterações relevantes deste projeto serão documentadas neste ficheiro.

O formato segue uma aproximação ao [Keep a Changelog](https://keepachangelog.com/) e utiliza versionamento semântico inspirado em [SemVer](https://semver.org/).

---

## [v1.2.2] – Trust presets & config hardening

### Adicionado
- Presets de Trust (Equilibrado, Rigoroso, Flexível) no painel **Extras → Trust**, com botão **Aplicar**.
- Botão **Guardar Trust** para persistir as definições globais via API.

### Alterado
- O painel de Trust deixa de ser read-only quando o utilizador da dashboard tem permissão **canEditConfig**.

### Corrigido
- Removido hardcode de role-id na listagem de utilizadores; agora ignora automaticamente roles geridos/integration.
- Endpoint global `/api/config` passa a respeitar RBAC (view/edit) quando a autenticação do dashboard está ativa.

## [v1.1.0] – Trust system & Extras refinements

### Adicionado
- Sub-tab **Trust** em **Extras**, com:
  - Painel dividido entre formulário de configuração e painel de resumo.
  - Inputs pré-preenchidos com a configuração atual de trust do servidor.
  - Layout responsivo e integrado com o design restante da dashboard.
- Melhorias na tab **Configuração**:
  - Subcards separados para **Registos e canais de logs** e **Acesso e cargos de staff**.
  - Textos de ajuda (hints) mais claros sobre o papel de cada secção.
- Refinamentos na tab **Hub de moderação** e mini-painéis relacionados:
  - Ajustes de tipografia e espaçamento nos **Registos do Servidor** para leitura mais confortável.

### Alterado
- Layout da secção de **Voz Temporária** e de painéis em Extras para reduzir inconsistências com a tab de Utilizadores.
- Estilos do Sistema de Trust para alinhar com a identidade visual da dashboard (cards, grids e hints).

### Corrigido
- Removida a maior parte das situações que causavam **scrollbar horizontal**, em especial na configuração de Voz Temporária.
- Pequenos ajustes de i18n e alinhamento de chaves utilizadas no frontend.

---

## [v1.0.13] – Dashboard & UX refinements

### Adicionado
- Badge **Bot online/offline** no topo da dashboard, alimentado pelo endpoint `/health`.
- Mini-painéis na tab **Hub de moderação**:
  - Análises do Servidor por intervalo (24h / 7d / 30d / 1 ano).
  - Análises de Tickets com paginação e filtro por período.
  - Registo de Utilizadores Online preparado para dados reais de presença.
- Secção **Registos do Servidor** com filtros de pesquisa, tipo de ação e limite configurável de registos.
- Sistema de internacionalização (i18n) refatorado no frontend, com ficheiros dedicados em `public/locales/` e helper `t(key, params)`.
- Melhorias de UI na secção de Voz Temporária (layout em mini-painel, alinhado com Utilizadores e GameNews).
- Endpoint `/api/mod/overview` no backend para fornecer estatísticas rápidas de moderação e tickets.

### Alterado
- Tab **GameNews** alinhada com o padrão master-detail usado em Utilizadores (lista à esquerda + painel de detalhe à direita).
- Painel de **Voz temporária** (Extras) ajustado para ter mini-painel de detalhe visualmente consistente com o resto da UI.
- Dashboard atualizada para:
  - Reutilizar mais componentes de layout (`user-layout`, mini-paineis).
  - Garantir que, em caso de erro 401, o utilizador é devolvido ao ecrã de login.

### Corrigido
- Remoção da antiga tab **Cases** e respetiva lógica legacy no frontend.
- Erros de sintaxe em `dashboard.js` causados por ramos de tabs obsoletos.
- Problemas de CSS em `dashboard.css` (regra solta que afetava a secção GameNews).
- Vários pontos de scroll horizontal indesejado, especialmente no painel de Voz Temporária.

---

## [v1.0.0] – Primeira versão pública

### Adicionado
- Bot Discord com:
  - Comandos de moderação (`warn`, `mute`, `unmute`, `clear`, `userinfo`, `help`).
  - Integração com MongoDB para registo de infrações.
- Dashboard web inicial:
  - Visão geral do servidor.
  - Tabs de Utilizadores, Logs, Tickets, GameNews e Configuração.
- Sistema de GameNews baseado em RSS.
- Sistema de canais de Voz Temporária com configuração guardada em MongoDB.
- Configuração base em `defaultConfig.js` e integração com variáveis `.env`.

---

## Histórico anterior

Versões intermédias (ex: 1.0.1–1.0.12) focaram-se sobretudo em:

- Ajustes incrementais de UI na dashboard.
- Pequenas correções ao fluxo de tickets e logs.
- Melhorias na robustez do bot (tratamento de erros, estados de conexão, etc.).

Para detalhes finos dessas versões, consultar o histórico de commits.
