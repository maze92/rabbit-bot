# Security notes (.rabbit)

This repository ships with a built-in dashboard (Express + JWT auth). To run it safely in production:

1. Set a strong JWT secret:
   - `DASHBOARD_JWT_SECRET` (>= 32 random chars)

2. Configure CORS explicitly (required in production):
   - `DASHBOARD_ORIGIN=https://<your-domain>`
   - or `dashboard.allowedOrigins` in `src/config/defaultConfig.js`

   If you do not configure CORS, the server will refuse cross-origin requests in production.
   This is intentional hardening.

3. Prefer JWT login over any legacy static token.
   - `DASHBOARD_ADMIN_USER` / `DASHBOARD_ADMIN_PASS` bootstrap an ADMIN user on first login.
   - Rotate the password after first login.

4. Restrict dashboard users to specific guilds when needed:
   - Set `allowedGuildIds` on a dashboard user (via dashboard user management).

5. Rate limiting:
   - Baseline limiter is applied on `/api` plus stricter per-endpoint limiters on auth/mod actions.

If you want true per-guild operator identity, migrate dashboard auth to Discord OAuth2 (recommended long-term).
