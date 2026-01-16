# Ozark Discord Bot

Ozark é um bot de Discord focado em **moderação automática**, **gestão de infrações**, **sistema de Trust Score**, **RSS Game News** e **dashboard web em tempo real**.

O objetivo do projeto é oferecer uma base **robusta, extensível e profissional**, adequada tanto para servidores pequenos como para comunidades maiores.

---

## 🚀 Funcionalidades Principais

### 🛡️ Moderação Automática (AutoMod)
- Deteção de palavras proibidas (PT / EN)
- Normalização de texto (leet, símbolos, links, emojis)
- Apagamento automático de mensagens ofensivas
- Sistema de **warnings progressivos**
- Timeout automático ao atingir o limite
- Severidade ajustada por **Trust Score**
- Notificação por **DM** ao utilizador (configurável)

---

### 🔐 Trust Score System
- Cada utilizador possui um Trust Score persistente
- Penalizações automáticas:
  - WARN → reduz trust
  - MUTE → penalização maior
- Regeneração automática de trust ao longo do tempo
- Trust influencia:
  - Nº de avisos tolerados
  - Duração do mute
- Sistema centralizado (`warningsService`)

---

### 🧑‍⚖️ Comandos de Staff
- `!warn` – aviso manual com trust + logs
- `!mute` / `!unmute` – timeout manual com hierarquia segura
- `!clear` – limpeza de mensagens
- `!userinfo` – info do utilizador (trust visível apenas para staff)
- Cooldowns por comando e utilizador

---

### 🚫 Anti-Spam / Flood Protection
- Deteção de spam por frequência de mensagens
- Timeout automático
- Cooldown de ações para evitar loops
- Bypass por roles ou administradores
- Logs automáticos

---

### 📰 Game News (RSS)
- Sistema RSS modular (GameSpot)
- Um feed → um canal
- Dedupe real via hashes persistentes
- Bloqueio de notícias antigas
- Retry com jitter
- Backoff automático por feed
- Persistência de estado no MongoDB

---

### 📊 Dashboard Web (Tempo Real)
- Logs em tempo real via Socket.IO
- Persistência de logs no MongoDB
- Painel **GameNews Status**:
  - Estado do feed (OK / Paused)
  - Última notícia enviada
  - Nº de falhas
  - Nº de hashes guardados
- API protegida por token (opcional)
- Interface simples e leve

---

### ❤️ Health & Estabilidade
- Endpoint `/health` com estado do sistema
- MongoDB connection guard
- ErrorGuard global
- Proteção contra crashes por falhas externas

---

## 🧱 Stack Técnica
- Node.js
- discord.js v14+
- MongoDB (Mongoose)
- Express + Socket.IO
- Railway ready

---

## ⚙️ Configuração
Todas as opções estão centralizadas em: src/config/defaultConfig.js
Inclui:
- Moderação
- Trust Score
- Anti-spam
- GameNews
- Dashboard
- Cooldowns

---

## 📌 Estado do Projeto
✔️ Estável  
✔️ Modular  
✔️ Pronto para expansão futura (tickets, appeals, levels, etc.)
