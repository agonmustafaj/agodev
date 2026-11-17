# AgoDev

SEO and web development by Agon Mustafaj, at https://agodev.agonmustafaj.com/

Static site + contact API run on **Cloudflare Pages** (GitHub source). The portfolio at https://agonmustafaj.com stays on GitHub Pages and still supplies shared CSS/JS/i18n.

## Contact form

Fields: project type, name, email, phone, optional budget, optional timeline, message. Honeypot: `botcheck`.

Form posts JSON to:

```text
https://agodev.agonmustafaj.com/api/contact
```

(Pages Function: `functions/api/contact.js`)

Email subject: `Mesazh nga faqja: {name}`. Body is a labeled field list (HTML + plain text) via **Resend**. Inbox can still be Gmail (`CONTACT_TO`). Cloudflare Workers/Pages cannot speak Gmail SMTP directly.

## Cloudflare setup checklist (Agon)

### 1. Create a **new** Pages project for AgoDev

You already have a Cloudflare project named `portfolio` (repo `agonmustafaj/portfolio`). **Do not reuse or fix that project for AgoDev.** Create a separate Pages project.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the **`agonmustafaj/agodev`** repository (not portfolio).
3. Project name: `agodev` (must be distinct from `portfolio`).
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`public`** (required; do **not** use `/` or `.`)
5. Save and deploy. Note the `*.pages.dev` URL (for example `agodev.pages.dev`).

**Why `public`?** Pages Functions live in repo-root `functions/`. That folder must be a **sibling** of the build output, not inside it. With output `/` or `.`, `/api/contact` never registers (browser gets a static 404/405 and the form shows “message did not send”).

Ignore the failing `portfolio` / `portfolio.agonmustafaj01.workers.dev` build for this work.

Optional instead of dashboard Git: add GitHub Actions secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` on the **agodev** repo and use `.github/workflows/deploy-cloudflare-pages.yml`.

### 2. DNS for `agodev.agonmustafaj.com`

1. In Cloudflare DNS for `agonmustafaj.com`, add (or edit) a **CNAME**:
   - Name: `agodev`
   - Target: `agodev.pages.dev` (or the exact Pages hostname Cloudflare shows)
   - Proxy status: **Proxied** (orange cloud)
2. Pages project → **Custom domains** → add `agodev.agonmustafaj.com` and complete validation.
3. Turn off GitHub Pages custom domain for this hostname if it is still active, so DNS is not split.
4. Remove any leftover Vercel DNS / project links.

### 3. Email provider (Resend sends → Gmail receives)

**Can you use Gmail?** Yes for the inbox. Set `CONTACT_TO` to your Gmail address (for example `agonmustafaj01@gmail.com`). Form notifications arrive there like normal mail.

**Can Cloudflare send through Gmail SMTP?** No. Pages/Workers cannot use Gmail SMTP or nodemailer. Sending still goes through **Resend** (HTTP API). You need a Resend account and API key; `CONTACT_FROM` must be a Resend-verified sender/domain.

1. Create a [Resend](https://resend.com) account and API key.
2. Verify a sending domain you control (for example `agonmustafaj.com`), or use Resend’s onboarding sender only for tests.
3. In Pages → **Settings** → **Environment variables** (Production and Preview):

| Name | Encrypt? | Example |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | `re_...` |
| `CONTACT_TO` | yes | `agonmustafaj01@gmail.com` (Gmail inbox is fine) |
| `CONTACT_FROM` | yes | `AgoDev <contact@agonmustafaj.com>` (must be allowed by Resend, not a raw Gmail From) |
| `ALLOWED_ORIGINS` | no | `https://agodev.agonmustafaj.com,https://agonmustafaj.com,https://www.agonmustafaj.com` |

4. Redeploy after adding secrets so Functions pick them up.

Mailchannels is an alternative Worker email path; this repo ships Resend only.

### 4. Wire the form endpoint

Already set on the form as:

```html
data-endpoint="https://agodev.agonmustafaj.com/api/contact"
```

Portfolio `CONTACT_ENDPOINT` should match the same URL after the portfolio PR merges. Until DNS points at Cloudflare Pages, `/api/contact` will 404.

### 5. Shared assets from the portfolio

This page loads CSS/JS from `agonmustafaj.com`. Bump `?v=` in `index.html` when portfolio assets change. Form card CSS also ships locally at `css/contact-form.css`.

### 6. What only Agon can do in the dashboard

- Connect the GitHub repo (OAuth) or create the API token for Actions
- Add the custom domain and approve DNS
- Create Resend account, verify domain, paste secrets
- Disable old Vercel / GitHub Pages hostname if still competing

## Local Function smoke test

```bash
npx wrangler pages dev public --port 8788
# GET  http://127.0.0.1:8788/api/contact  → {"ok":true,...}
# POST http://127.0.0.1:8788/api/contact  with JSON body
# put secrets in .dev.vars (gitignored): RESEND_API_KEY, CONTACT_TO, CONTACT_FROM
```

### After this Functions fix lands

1. In Pages → **Settings** → **Builds & deployments**, set **Build output directory** to `public` (if it is still `/`).
2. Confirm secrets exist for Production (and Preview): `RESEND_API_KEY`, `CONTACT_TO`, `CONTACT_FROM`.
3. Trigger a new production deploy (Retry deployment, or push/merge to `main`).
4. Smoke check: `GET https://agodev.pages.dev/api/contact` should return JSON `{"ok":true,...}`, not the HTML 404 page.
5. Then retry the form on https://agonmustafaj.com/contact/ and https://agodev.agonmustafaj.com/#start.

## Translations

Form copy uses `agodev.form*` keys in the portfolio `js/i18n.js` (EN + SQ).

## Deploy note

Cloudflare Pages must build commit `77148a9` or newer (includes `public/` + `functions/`). Do not retry older deployments such as `f390818`.
