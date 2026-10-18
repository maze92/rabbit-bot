# Koyeb deployment

Recommended environment variables:

- `NODE_ENV=production`
- `DISCORD_TOKEN=...`
- `MONGO_URI=...`

Dashboard auth (Discord OAuth 2.0):
- `DASHBOARD_JWT_SECRET=...` (strong random)
- `DISCORD_OAUTH_CLIENT_ID=...`
- `DISCORD_OAUTH_CLIENT_SECRET=...`
- `BOT_ADMIN_IDS=...` (Discord user IDs, separated by commas; only these users receive bot-wide administration and can inspect payment history)
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
