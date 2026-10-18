# Koyeb deployment

Recommended environment variables:

- `NODE_ENV=production`
- `DISCORD_TOKEN=...`
- `MONGO_URI=...`

Dashboard auth (Discord OAuth 2.0):
- `DASHBOARD_JWT_SECRET=...` (strong random)
- `DISCORD_OAUTH_CLIENT_ID=...`
- `DISCORD_OAUTH_CLIENT_SECRET=...`
- `BOT_OWNER_IDS=...` (Discord user IDs separated by commas; these are the bot/application owners and only they can change global Premium pricing/settings)
- `BOT_ADMIN_IDS=...` (delegated bot operators, Discord user IDs separated by commas; they can manage server Premium licenses and inspect payment history, but cannot change global Premium settings)
- `BOT_OWNER_IDS` takes precedence if an ID appears in both lists. Configure at least one owner ID before deploying; if unset, global Premium settings are locked.
- Use the Discord **user ID** of the person authorized to own the bot application in the Developer Portal, not the application/client ID or a Discord server owner ID. For a team-owned application, list only the people explicitly trusted with global control.
- After changing either ID list, restart the app and sign out/in to refresh dashboard roles; existing sessions can retain their role for up to four hours.
- `DASHBOARD_ORIGIN=https://<your-koyeb-domain>`  (required for the dashboard UI)
- Register the redirect URI in the Discord Developer Portal: `https://<your-koyeb-domain>/api/auth/discord/callback`

PayPal Premium:
- `PAYPAL_CLIENT_ID=...`
- `PAYPAL_CLIENT_SECRET=...`
- `PAYPAL_ENV=sandbox` while testing, then `live` for real payments
- `PAYPAL_PREMIUM_PRICE=...` (positive amount, with up to two decimal places)
- `PAYPAL_CURRENCY=EUR`
- `PREMIUM_DURATION_DAYS=30`
- `PAYPAL_WEBHOOK_ID=...`
- Register `https://<your-koyeb-domain>/api/premium/paypal/webhook` in PayPal for the `PAYMENT.CAPTURE.COMPLETED` event.

The app captures successful orders server-to-server and also verifies PayPal webhook signatures. Keep the client secret and webhook ID private; use sandbox credentials and a sandbox webhook before switching to live mode.

Optional:
- `DASHBOARD_ALLOW_ANY_ORIGIN=true` (NOT recommended; bypasses CORS hardening)
