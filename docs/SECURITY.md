# Security notes (.rabbit)

This repository ships with a built-in dashboard (Express + JWT auth). To run it safely in production:

1. Set a strong JWT secret:
   - `DASHBOARD_JWT_SECRET` (>= 32 random chars)

2. Configure CORS explicitly (required in production):
   - `DASHBOARD_ORIGIN=https://<your-domain>`
   - or `dashboard.allowedOrigins` in `src/config/defaultConfig.js`

   If you do not configure CORS, the server will refuse cross-origin requests in production.
   This is intentional hardening.

3. Dashboard login is exclusively via Discord OAuth 2.0.
   - Configure `DISCORD_OAUTH_CLIENT_ID` and `DISCORD_OAUTH_CLIENT_SECRET`.
   - The OAuth callback issues a session JWT stored in an HttpOnly cookie; there is no local password login.

4. Guild access is scoped to the guilds returned by Discord OAuth:
   - The token carries `allowedGuildIds`; requests to any other guild are rejected.

5. Rate limiting:
   - Baseline limiter is applied on `/api` plus stricter per-endpoint limiters on auth/mod actions.
