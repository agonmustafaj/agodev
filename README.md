# AgoDev

SEO and web development by Agon Mustafaj, at https://agodev.agonmustafaj.com/

Static site + contact API on **Cloudflare Pages**. Contact uses Advanced mode: root `_worker.js` (not `/functions`). Shared CSS/JS still load from https://agonmustafaj.com.

## Why the form failed before

Live smoke (`GET/POST /api/contact` → 404 HTML / 405) meant **no Worker was registered**. Also, `agodev.pages.dev` was still serving an **old** HTML form (pre Ré nao fields), so Pages was not publishing latest `main`.

Do not keep Retry-ing old Deployments (for example commit `f390818`). Open **Deployments**, confirm the active Production deployment commit includes `_worker.js` and the new form, then deploy that commit.

## Cloudflare Pages settings (use these)

Project: **`agodev`** (separate from `portfolio`). Leave `portfolio` alone.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | *(empty)* |
| Build output directory | **`/`** or **`.`** (not `public`) |

Secrets (Production + Preview, encrypted):

| Name | Example |
| --- | --- |
| `RESEND_API_KEY` | `re_...` |
| `CONTACT_TO` | `agonmustafaj01@gmail.com` (Gmail inbox is fine) |
| `CONTACT_FROM` | `AgoDev <contact@agonmustafaj.com>` (Resend-verified sender) |
| `ALLOWED_ORIGINS` (optional plain) | `https://agodev.agonmustafaj.com,https://agonmustafaj.com,https://www.agonmustafaj.com` |

**Gmail:** receive on Gmail via `CONTACT_TO`. Cloudflare cannot send with Gmail SMTP; Resend sends.

### Deployments UI checklist

1. Workers & Pages → **agodev** → **Deployments**.
2. Active Production deployment commit must include `_worker.js` and the new contact form fields (project type, phone, budget, timeline).
3. If the newest `main` commit is not building: **Create deployment** / **Retry** on that commit, or fix Git integration (production branch `main`, builds enabled).
4. Smoke: `GET https://agodev.pages.dev/api/contact` must return JSON like `{"ok":true,"service":"agodev-contact",...}`, **not** the HTML 404 page.
5. Then retry https://agonmustafaj.com/contact/ and https://agodev.agonmustafaj.com/#start.

## Contact API

- URL: `https://agodev.agonmustafaj.com/api/contact`
- Subject: `Mesazh nga faqja: {name}`
- Fields: project type, name, email, phone, optional budget/timeline, message, honeypot `botcheck`

## Optional: standalone Worker

If Pages still will not run `_worker.js`, deploy the Worker under `worker/`:

```bash
cd worker
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CONTACT_TO
npx wrangler secret put CONTACT_FROM
npx wrangler deploy
```

Then set the form `data-endpoint` / portfolio `CONTACT_ENDPOINT` to that `*.workers.dev/api/contact` URL.

## Local smoke

```bash
npx wrangler pages dev . --port 8788
# GET  /api/contact → JSON ok
# POST /api/contact → needs .dev.vars secrets
```
