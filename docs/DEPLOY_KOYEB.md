# Koyeb deployment

Recommended environment variables:

- `NODE_ENV=production`
- `DISCORD_TOKEN=...`
- `MONGO_URI=...`

Dashboard auth:
- `DASHBOARD_JWT_SECRET=...` (strong random)
- `DASHBOARD_ADMIN_USER=admin`
- `DASHBOARD_ADMIN_PASS=...` (>= 12 chars)
- `DASHBOARD_ORIGIN=https://<your-koyeb-domain>`  (required for the dashboard UI)

Optional:
- `DASHBOARD_ALLOW_ANY_ORIGIN=true` (NOT recommended; bypasses CORS hardening)
