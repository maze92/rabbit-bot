# Koyeb deployment

Recommended environment variables:

- `NODE_ENV=production`
- `DISCORD_TOKEN=...`
- `MONGO_URI=...`

Dashboard auth (Discord OAuth 2.0):
- `DASHBOARD_JWT_SECRET=...` (strong random)
- `DISCORD_OAUTH_CLIENT_ID=...`
- `DISCORD_OAUTH_CLIENT_SECRET=...`
- `BOT_ADMIN_IDS=...` (Discord user IDs, separated by commas; only these users receive bot-wide administration and can change Premium manually)
- `DASHBOARD_ORIGIN=https://<your-koyeb-domain>`  (required for the dashboard UI)
- Register the redirect URI in the Discord Developer Portal: `https://<your-koyeb-domain>/api/auth/discord/callback`

Optional:
- `DASHBOARD_ALLOW_ANY_ORIGIN=true` (NOT recommended; bypasses CORS hardening)
