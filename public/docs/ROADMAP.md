# .rabbit – Roadmap técnico

Este documento lista ideias e próximos passos para evoluir o projeto a médio/longo prazo.  
Não é um compromisso rígido, mas um guia de prioridades.

## 1. Dashboard / UX

- Melhorar navegação em “Utilizadores”:
  - Paginação ou scroll infinito em servidores com muitos membros.
  - Campo de pesquisa por nome/tag diretamente na tabela.
- Filtros mais ricos na aba “Moderação”:
  - Filtrar por tipo de ação (Warn, Mute, Ban, etc.).
  - Filtrar por utilizador/moderador.
  - Intervalos de datas customizáveis.
- Melhor feedback para estados vazios:
  - Mensagens claras quando não há logs, infrações ou GameNews configurados.
  - Tooltips explicativos para badges (Trust, GameNews, status do bot).

## 2. Arquitetura da Dashboard

- Extrair rotas da dashboard para módulos dedicados:
  - `dashboard/routes/users.js`
  - `dashboard/routes/moderation.js`
  - `dashboard/routes/gamenews.js`
  - `dashboard/routes/config.js`
- Criar camada de serviços:
  - `services/guildService.js` (acesso ao Discord client, fetch de membros/canais).
  - `services/moderationService.js` (CRUD de infrações).
  - `services/gameNewsService.js` (feeds, estado, erros).
- Objetivo: facilitar testes unitários, evitar duplicação de lógica e reduzir o tamanho de `src/dashboard.js`.

## 3. Sistema de confiança (Trust)

- Refinar regras de pontuação:
  - Penalizações diferentes para Warn/Mute/Ban.
  - Bónus gradual por tempo sem infrações.
- Expor mais detalhes na dashboard:
  - Histórico visual da evolução do Trust de um utilizador.
  - Tabela com distribuição de Trust no servidor (quantos utilizadores em “alto risco”, “risco médio”, “seguro”).
- Possível futuro:
  - Ajustar automaticamente a agressividade da automoderação em função do Trust médio do servidor.

## 4. GameNews

- Filtros por idioma / palavras-chave:
  - Excluir termos ou jogos específicos.
- Estatísticas:
  - Quantidade de notícias enviadas por dia.
  - Último erro de GameNews (se existir), mostrado na dashboard.
- Suporte a múltiplos canais por feed:
  - Permitir replicar notícias em mais que um canal se fizer sentido (por exemplo, canal global + canal da staff).

## 5. Testes e qualidade

- Testes unitários:
  - `systems/logger` – garantir formato consistente de logs de moderação.
  - `systems/gamenews` – parsing de RSS, deduplicação e agendamento.
  - `systems/maintenance` – limpeza de infrações/logs antigos.
- Testes de integração de API:
  - Usar supertest para validar rotas críticas (`/api/guilds`, `/api/logs`, `/api/gamenews/*`).
- Linters/formatters:
  - Adicionar ESLint + Prettier com regras consensuais.
  - Script `npm run lint` para ajudar a manter o estilo consistente.

## 6. Observabilidade

- Adicionar um endpoint interno de métricas (não exposto publicamente) com:
  - Contadores de comandos executados.
  - Tempo médio de resposta de endpoints chave.
- Integração futura com ferramentas de monitorização (Prometheus/Grafana ou alternativa equivalente suportada pela infraestrutura).

Este roadmap serve como referência.  
A cada alteração maior (por exemplo, refactor de um módulo ou adição de uma funcionalidade), recomenda-se atualizar este ficheiro para manter alinhamento entre o código real e os objetivos do projeto.
