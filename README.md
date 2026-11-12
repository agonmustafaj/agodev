# AgoDev

SEO and web development by Agon Mustafaj, served at https://agodev.agonmustafaj.com/ (static site + Vercel serverless `api/`).

The page reuses the stylesheet, scripts, translations, header, footer and project data from the portfolio at https://agonmustafaj.com (repo `agonmustafaj/portfolio`). The `<base href="https://agonmustafaj.com/">` tag makes the rendered header, footer and project links point to the portfolio, so links within this page must be absolute `https://agodev.agonmustafaj.com/...` URLs.

When the portfolio bumps its `?v=` asset versions, update the matching `<link>` and `<script>` tags in `index.html`.

Text on the page is translated through the `agodev.*` and `services.*` keys in the portfolio's `js/i18n.js`.

## Paysera Test Mode checkout (Checkout Modern)

Minimal harness to prove a €1 Test Mode payment end-to-end with [Paysera Checkout Modern](https://developers.paysera.com/guides/checkout-modern) (REST API integration, **not** legacy WebToPay `projectid` / `sign_password`).

### Flow

1. Open https://agodev.agonmustafaj.com/paysera-test/
2. Click **Pay €1 (Test Mode)** — the browser POSTs to `/api/paysera/create-checkout`
3. Server creates a local order (`status: unpaid`) with a **fixed €1.00 / 100 cents** amount (never taken from the client)
4. Server OAuth-authenticates with `PAYSERA_CLIENT_ID` / `PAYSERA_CLIENT_SECRET`, creates a Paysera order + payment link, returns `paymentUrl`
5. Browser redirects to Paysera (Test Mode UI: no real money)
6. Paysera POSTs to `https://agodev.agonmustafaj.com/api/paysera/callback` — HMAC-SHA256 verified with `PAYSERA_CLIENT_SECRET` (`X-Paysera-Signature`); only then is the order marked `paid` and the Paysera payment id stored
7. Browser return URL `/paysera-test/thanks/` shows a message only — **it does not mark the order paid**
8. Dashboard https://agodev.agonmustafaj.com/paysera-test/dashboard/ lists orders (including Paysera order/payment ids)

Official guides used:

- https://developers.paysera.com/guides/checkout-modern
- https://developers.paysera.com/guides/checkout-modern/api-integration

### Env vars (Vercel project for agodev.agonmustafaj.com)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PAYSERA_CLIENT_ID` | yes | OAuth client id from the **Test Mode** Checkout project → Integrations |
| `PAYSERA_CLIENT_SECRET` | yes | OAuth client secret (also the webhook HMAC secret) |
| `SITE_URL` | recommended | Defaults to `https://agodev.agonmustafaj.com` |
| `UPSTASH_REDIS_REST_URL` | yes on Vercel | Durable order store (Upstash Redis REST) |
| `UPSTASH_REDIS_REST_TOKEN` | yes on Vercel | Upstash Redis REST token |
| `PAYSERA_DASHBOARD_TOKEN` | optional | If set, `/api/paysera/orders` requires `Authorization: Bearer …` or `?token=` |

**Not used (legacy WebToPay):** `projectid`, `sign_password`, `payamount` form posts. Checkout Modern uses OAuth client credentials + JSON orders/payment-links + `X-Paysera-Signature` HMAC on the raw callback body.

Also keep existing contact env if you use the form: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CONTACT_TO`.

### Paysera project setup

1. In the Paysera Merchant Portal, create a **separate** Checkout project for testing
2. Enable **Test Mode** on that project (actions menu → Enable Test Mode)
3. Copy API credentials (`client_id` / `client_secret`) into the Vercel env vars above
4. Ensure the project allows the callback URL `https://agodev.agonmustafaj.com/api/paysera/callback` (and success/failure URLs under `/paysera-test/`) as required by the portal
5. Redeploy after setting env vars

### Smoke test

1. Confirm env vars are set and the site is redeployed
2. Visit `/paysera-test/` → Pay €1 → complete the Paysera **test** payment simulator (success)
3. Land on `/paysera-test/thanks/` — message only; dashboard may still show unpaid for a moment
4. Refresh `/paysera-test/dashboard/` until status is `paid` and **Paysera payment ID** is filled
5. Confirm the thank-you URL alone never flips status without a callback

### Local persistence note

Without Upstash, orders are written to `data/paysera-orders.json` (gitignored) for local Node runs. On Vercel, Upstash is required so unpaid → paid survives across serverless invocations.
