# Koyeb deployment

Recommended environment variables:

- `NODE_ENV=production`
- `DISCORD_TOKEN=...`
- `MONGO_URI=...`

Dashboard auth (Discord OAuth 2.0):

- `DASHBOARD_JWT_SECRET=...` (strong random)
- `DISCORD_OAUTH_CLIENT_ID=...`
- `DISCORD_OAUTH_CLIENT_SECRET=...`
- `BOT_OWNER_IDS=<Discord user ID>` (optional; configure exactly one trusted Discord user ID for global bot ownership)
- Discord user `810243963574550558` is the default bot owner. A valid ID in `BOT_OWNER_IDS` replaces that default; if multiple IDs are supplied, only the first valid ID is recognized. The owner has global dashboard access but can manage a server only if they are also its Discord owner or Administrator.
- Use the Discord **user ID** of the single person authorized to own the bot application in the Developer Portal, not the application/client ID or a Discord server owner ID. A team-owned application still has one dashboard owner; do not list multiple operators.
- After changing the owner ID, restart the app and refresh the dashboard so the new owner role is loaded.
- Only the configured bot owner can open the **Management** tab, and only while in Global mode. It lists server licenses and a paginated payment history; Premium modules still require an active license.
- `DASHBOARD_ORIGIN=https://<your-koyeb-domain>` (required for the dashboard UI)
- Register the redirect URI in the Discord Developer Portal: `https://<your-koyeb-domain>/api/auth/discord/callback`

PayPal Premium:

- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`
- `PAYPAL_ENV=sandbox` while testing, then `live` for real payments
- `PREMIUM_DURATION_DAYS=30`
- `PAYPAL_WEBHOOK_ID=...`
- Register `https://<your-koyeb-domain>/api/premium/paypal/webhook` in PayPal for the `PAYMENT.CAPTURE.COMPLETED` event.

Premium checkout is fixed at €10 per server; only the license duration and optional PayPal.Me reference link are configurable in the dashboard. A reference link is prefilled for €10 and requires manual payment verification. The app captures successful orders server-to-server and also verifies PayPal webhook signatures. Keep the client secret and webhook ID private; use sandbox credentials and a sandbox webhook before switching to live mode.

Optional:

- `DASHBOARD_ALLOW_ANY_ORIGIN=true` (NOT recommended; bypasses CORS hardening)
- `TWITCH_CLIENT_ID=...` and `TWITCH_CLIENT_SECRET=...` (required only for Twitch live alerts; they are used to obtain a Twitch app token via OAuth client credentials and check the Helix `streams` endpoint. The username of the streamer is still configured per guild/server in the dashboard itself; the credentials are app-level, not per-user.)
