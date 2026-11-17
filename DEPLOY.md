# AgoDev deploy options (Git reconnect blocked)

Production is stuck on old commit `f390818` while GitHub is disconnected from the Pages project. Pick one path below. Do **not** retry `f390818`.

Latest code to ship: `main` tip with root `_worker.js` (contact API) + static site.

## Option A (preferred): Wrangler / GitHub Actions

Works without reconnecting Git in the Cloudflare dashboard.

### 1) Create a Cloudflare API token

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. Use template **Edit Cloudflare Workers**, or custom with:
   - Account: **Cloudflare Pages: Edit**
   - Account: **Account Settings: Read** (for account id)
3. Copy the token once.

Account ID: Workers & Pages overview (right sidebar) or any Workers project URL.

### 2a) One-shot from your machine

```bash
cd /path/to/agodev
npx wrangler login   # or: export CLOUDFLARE_API_TOKEN=...
npx wrangler pages deploy . --project-name=agodev
```

Build output for this repo is **`.`** (root). Do **not** put `RESEND_API_KEY` / `CONTACT_TO` / `CONTACT_FROM` in `wrangler.toml` `[vars]` (that locks the dashboard).

Set Production **Secrets** in the dashboard, or:

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name=agodev
npx wrangler pages secret put CONTACT_TO --project-name=agodev
npx wrangler pages secret put CONTACT_FROM --project-name=agodev
```

### 2b) GitHub Actions (repeatable)

On GitHub repo `agonmustafaj/agodev` → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |

Then: Actions → **Deploy Cloudflare Pages** → **Run workflow** (`workflow_dispatch`), or push to `main`.

Workflow file: `.github/workflows/deploy-cloudflare-pages.yml`

### 3) Smoke

```bash
curl -s https://agodev.pages.dev/api/contact
# expect: {"ok":true,"service":"agodev-contact",...}
```

Then test https://agonmustafaj.com/contact/ and https://agodev.agonmustafaj.com/#start.

## Option B: Formspree (no Cloudflare API for mail)

If Wrangler is blocked too, route the form to Formspree (portfolio PR wires the client).

1. Create a form at https://formspree.io → copy `https://formspree.io/f/xxxxxx`
2. In portfolio `js/data.js` set:
   `CONTACT_ENDPOINT = 'https://formspree.io/f/xxxxxx'`
3. On AgoDev + portfolio contact `<form>` set the same URL in `data-endpoint="..."`
4. Bump `?v=` on script tags and merge/deploy portfolio (GitHub Pages).

Formspree emails you; Resend/CF Worker not required for that path.

## Option C: GitLab mirror (deferred)

Only if Agon explicitly chooses GitLab: mirror `agodev` to GitLab and connect **that** repo in Cloudflare Pages. Do not start this unless he picks it.

## Not recommended

- Retrying Production deployment `f390818`
- Build output `public` (current layout is root + `_worker.js`, output `/` or `.`)
