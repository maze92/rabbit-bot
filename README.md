# .rabbit

.rabbit é um bot de **moderação para Discord** com uma **dashboard web** integrada, focado em:

- Moderar servidores de forma rápida e transparente.
- Centralizar histórico de ações (warn, mute, ban, tickets, etc.).
- Integrar notícias via RSS (GameNews).
- Gerir canais de **voz temporária** de forma automática.

> Versão atual: **v1.1.0**

---

## 🧩 Stack técnica

- **Node.js** 20.x
- **discord.js** ^14.25.1
- **Express** (API + dashboard)
- **MongoDB** (armazenamento de configurações, infrações, tickets, etc.)
- **Socket.io** (atualizações em tempo real na dashboard)
- Frontend em **HTML + CSS + JavaScript vanilla**, sem frameworks pesadas.

---

## ✨ Funcionalidades principais

### 🔧 Moderação

- Comandos slash integrados com o dashboard:
  - `warn`, `mute`, `unmute`, `clear`, `userinfo`, `help` (e outros que venhas a adicionar).
- Histórico de ações acessível na tab **Hub de moderação**:
  - Filtros por tipo (warn/mute/ban/tickets).
  - Limite configurável de registos por página.
- Mini-painéis de análise:
  - **Análises do Servidor** – resumo rápido das ações de moderação por intervalo (24h / 7d / 30d / 1 ano).
  - **Análises de Tickets** – lista dos tickets mais recentes, com paginação.
  - **Registo de Utilizadores Online** – preparado para receber dados reais de presença.

### 🎟️ Sistema de Tickets

- Criação e encerramento de tickets a partir do Discord.
- Integração com a dashboard:
  - Últimos tickets.
  - Relação entre tickets e utilizadores.
- Preparado para expansão com mais estados / tipos de ticket.

### 📰 GameNews (RSS)

- Configuração de **feeds RSS** por servidor.
- Envio automático de notícias para canais específicos.
- Dashboard com:
  - Lista de feeds configurados.
  - Estado de cada feed (último envio, erros, etc.).
  - Edição rápida de URL, canal, intervalo e título.

### 🔊 Voz temporária

- Canais de voz base que criam salas temporárias quando um utilizador entra.
- Salas temporárias são removidas automaticamente quando ficam vazias.
- Dashboard com:
  - Lista de canais base.
  - Configuração de:
    - Categoria de criação.
    - Canal de logs.
    - Escolha de nome das salas (padrões dinâmicos).
    - Delay para limpar canais e outras opções.
  - Lista de salas temporárias ativas.

### 🌐 Dashboard web

- Autenticação com token (DASHBOARD_TOKEN).
- Seleção de servidor e tabs por contexto:
  - **Visão geral**
  - **Utilizadores**
  - **Hub de moderação**
  - **Tickets** (se configurado)
  - **GameNews**
  - **Extras** (feeds RSS, voz temporária, tickets, sistema de Trust)
  - **Configuração**
- Indicação visual de **bot online/offline** no topo da dashboard.

### 🌍 Internacionalização (i18n)

- Sistema de i18n centralizado no frontend.
- Idioma atual guardado em `state.lang` e persistido no browser.
- Ficheiros de idioma em `public/locales/` (ex.: `pt.js`), preparados para crescer para `en`, `es`, etc.
- Suporte para placeholders e texto dinâmico no frontend via `t(key, params)`.

---

## 📦 Instalação

### 1. Requisitos

- **Node.js 20.x**
- **MongoDB** acessível (local ou remoto)
- Conta e bot registado em [Discord Developer Portal] com:
  - Token do bot
  - Intentos necessários para moderação, membros e mensagens.

### 2. Clonar o repositório

```bash
git clone https://github.com/maze92/rabbit-bot.git
cd rabbit-bot
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Configurar variáveis de ambiente

Cria um ficheiro `.env` na raiz com algo deste género:

```ini
DISCORD_TOKEN=seu_token_do_bot
MONGODB_URI=mongodb://localhost:27017/rabbit-bot
## Dashboard Auth (recomendado)
# JWT secret forte (>= 32 chars)
DASHBOARD_JWT_SECRET=coloca_um_segredo_muito_forte_aqui

# (LEGACY) Token fixo da dashboard. Não recomendado em produção.
# DASHBOARD_TOKEN=token_para_dashboard

## Slash commands
# Para evitar comandos duplicados no Discord, escolhe um scope:
# - global (default): regista globalmente
# - guild: regista apenas na guild indicada
# - both: regista global + guild (apenas para testes)
SLASH_SCOPE=global

# Guild para testes (só usado quando SLASH_SCOPE=guild|both)
# SLASH_GUILD_ID=123456789012345678

## Reverse proxy
# Em produção atrás de Koyeb/NGINX, o bot usa "trust proxy" por defeito.
# Podes desligar com:
# TRUST_PROXY=false
PORT=3000
NODE_ENV=production
```

> **Nota:** nomes específicos podem variar consoante a versão do projeto. Consulta `src/config` se quiseres afinar cada detalhe.

---

## ▶️ Execução

### Ambiente de desenvolvimento

```bash
npm run dev
```

- Inicia o bot e a API em modo desenvolvimento.
- Mostra logs detalhados no terminal.

### Produção

```bash
npm start
```

- Inicia o bot com `NODE_ENV=production`.
- Ideal para deploy em serviços como **Koyeb**, **Render**, etc.

---

## ⚙️ Configuração via dashboard

As principais opções de configuração vivem na tab **Configuração** da dashboard:

- Canal de logs principal.
- Cargos de staff.
- Preferências de registo.
- Opções relacionadas com GameNews e Voz temporária.

Grande parte da configuração avançada é persistida em MongoDB e exposta pela API em `/guilds/:id/config`.

---

## 🧪 Testes

O projeto inclui uma camada básica de testes automatizados:

```bash
npm test
```

Além disso, podes validar traduções (i18n) com:

```bash
npm run i18n:audit
```

Recomendado: ativar CI no GitHub (workflow incluído em `.github/workflows/ci.yml`).

---

## 📚 Estrutura do projeto (resumo)

```text
src/
  index.js              # Entrypoint do bot + API
  slash/                # Comandos slash
  events/               # Event handlers do Discord
  systems/              # i18n, status, error guard, etc.
  dashboard.js          # Servidor da dashboard
  config/               # Configuração padrão do projeto
public/
  index.html            # UI principal da dashboard
  css/dashboard.css     # Estilos da dashboard
  js/dashboard.js       # Lógica principal do frontend
  js/dashboard.*.js     # Módulos específicos (users, moderation, gamenews, etc.)
  locales/pt.js         # Traduções PT
```

---

## 🗺️ Roadmap (ideias futuras)

- Alimentar o painel de **Registo de Utilizadores Online** com dados reais de presença.
- Melhorar relatórios de tickets (filtros avançados, estados, exportação).
- Suporte completo a múltiplos idiomas (`en`, `es`, …).
- Mais widgets de saúde/status do servidor na Visão Geral.

---

## 📝 Changelog

Todas as alterações de versão são documentadas em [`CHANGELOG.md`](./CHANGELOG.md).

---

## 📄 Licença

Este projeto é distribuído sob a licença **MIT**. Consulta o ficheiro [`LICENSE`](./LICENSE) (se existir) ou o campo `license` em `package.json` para mais detalhes.
