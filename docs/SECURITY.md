# .rabbit – Segurança e configuração

Este documento resume os pontos críticos de segurança do projeto e como configurar as variáveis de ambiente de forma segura.

## 1. Tokens e segredos

Os seguintes valores **nunca** devem ser commitados no repositório:

- `DISCORD_TOKEN` – token do bot no Discord.
- `MONGO_URI` – string de ligação à base de dados MongoDB (inclui utilizador e password).
- `DASHBOARD_JWT_SECRET` – segredo usado para assinar tokens JWT da dashboard.
- `DASHBOARD_ADMIN_USER` / `DASHBOARD_ADMIN_PASS` – credenciais de administrador da dashboard.
- Qualquer outro token de API externa.

Em desenvolvimento, estes valores vivem no `.env` (que deve estar no `.gitignore`).  
Em produção (Koyeb), devem ser configurados exclusivamente via **Environment variables** na plataforma.

### Requisitos mínimos

- `DASHBOARD_JWT_SECRET` deve ter **pelo menos 32 caracteres**, misto de letras maiúsculas, minúsculas, números e símbolos.
- `DASHBOARD_ADMIN_PASS` deve ser uma password forte; evita passwords triviais como `12345` em produção.

## 2. Autenticação da Dashboard

A autenticação da dashboard segue estes passos:

1. O utilizador faz `POST /api/auth/login` com `username` e `password`.
2. Caso sejam válidos:
   - Se ainda não existir um utilizador na coleção `DashboardUserModel` com esse username:
     - É criado com role `ADMIN` e permissões totais.
   - É gerado um token JWT assinado com `DASHBOARD_JWT_SECRET`.
3. A resposta inclui:
   - Dados básicos do utilizador (id, username, role, permissions);
   - O `token` JWT.
4. O front-end guarda o token (tipicamente em `localStorage`) e envia em cada pedido:
   - Cabeçalho `Authorization: Bearer <token>` **ou**
   - Cabeçalho `X-Dashboard-Token: <token>`.

O middleware `requireDashboardAuth`:

- Extrai o token (`Authorization` ou `X-Dashboard-Token`);
- Valida a assinatura (JWT) e devolve um objeto `dashboardUser`;
- Em caso de falha devolve `401 Unauthorized`.

A rota `/api/auth/me` devolve o utilizador associado ao token atual, ou `401` se o token for inválido ou estiver em falta.

## 3. CORS e origem da dashboard

O CORS é configurado a partir de:

- `config.dashboard.allowedOrigins` **ou**
- `DASHBOARD_ORIGIN` (pode ser uma lista separada por vírgulas).

Exemplos:

```env
DASHBOARD_ORIGIN=https://rabbit-bot.koyeb.app
```

ou

```env
DASHBOARD_ORIGIN=https://rabbit-bot.koyeb.app,https://outro-dominio.com
```

Boas práticas:

- Evitar `*` como origem em produção.
- Garantir que o domínio usado pelo browser coincide com o configurado, para evitar problemas de auth/CORS.

## 4. Permissões do bot no Discord

Para a segurança do servidor no Discord:

- Dê ao bot apenas as permissões necessárias:
  - Leitura/escrita em canais onde o bot realmente atua (moderação, GameNews, tickets).
  - Permissões de moderação (Kick, Ban, Mute) apenas se o bot tiver comandos de moderação ativos.
- Use **cargos** específicos para o bot (por exemplo, `Bot – Ozark`) e controle as permissões por cargo.

## 5. Base de dados (MongoDB)

Recomendações:

- Usar um utilizador dedicado só para esta base de dados (`rabbit_db_user`).
- Restringir o IP / VPC na configuração do cluster, sempre que possível.
- Ativar TLS/SSL entre aplicação e base de dados (por omissão, Mongo Atlas já o faz).

## 6. Logs e dados sensíveis

- Evitar registar tokens, passwords ou secrets nos logs.
- Erros de autenticação e de rede podem ser logados, mas sem incluir o conteúdo de `Authorization` ou passwords.

## 7. Atualizações e dependências

O `package.json` define versões específicas de bibliotecas.  
Para aplicar updates de segurança:

1. Atualizar as versões no `package.json` (por exemplo, de `discord.js`, `mongoose`, `express`, etc.).
2. Corrida `npm install` em desenvolvimento e testar.
3. Fazer novo deploy para Koyeb.

Idealmente, no futuro, pode ser usado um scanner automático (como `npm audit` em CI) para alertar sobre vulnerabilidades conhecidas.
