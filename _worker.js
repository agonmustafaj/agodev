/**
 * Cloudflare Pages Advanced mode Worker (_worker.js).
 * Handles /api/contact and serves static assets via env.ASSETS.
 *
 * Runtime secrets bind on the Module Worker `env` argument (same bag as ASSETS):
 *   export default { async fetch(request, env) { env.RESEND_API_KEY ... } }
 * File-based Functions use context.env; Advanced mode is fetch(request, env).
 *
 * Secrets (Production, dashboard or `wrangler pages secret put`):
 *   RESEND_API_KEY, CONTACT_TO, CONTACT_FROM (bare email, e.g. contact@agonmustafaj.com)
 * Optional: ALLOWED_ORIGINS
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_SECRETS = ['RESEND_API_KEY', 'CONTACT_TO', 'CONTACT_FROM'];

/** Pages Advanced mode: bindings live on env. Guard rare nested wrappers. */
function runtimeEnv(env) {
  if (!env || typeof env !== 'object') return {};
  const nested = env.env;
  if (
    nested &&
    typeof nested === 'object' &&
    (nested.ASSETS || nested.RESEND_API_KEY || nested.CONTACT_TO || nested.CONTACT_FROM)
  ) {
    return nested;
  }
  return env;
}

function readSecret(env, name) {
  const bag = runtimeEnv(env);
  const value = bag[name];
  if (value == null) return '';
  return String(value).trim();
}

function missingSecrets(env) {
  return REQUIRED_SECRETS.filter((name) => !readSecret(env, name));
}

/** CONTACT_FROM may be bare email or `Name <email@domain>`. */
function parseFromAddress(raw) {
  const value = String(raw || '').trim();
  const angled = value.match(/<([^>]+)>/);
  if (angled) return angled[1].trim();
  return value;
}

const PROJECT_TYPES = {
  seo: 'SEO',
  website: 'Website',
  both: 'SEO and website'
};

const BUDGETS = {
  under_500: 'Under €500',
  '500_1500': '€500 to €1,500',
  '1500_3000': '€1,500 to €3,000',
  '3000_plus': '€3,000+',
  unsure: 'Not sure yet'
};

const TIMELINES = {
  asap: 'As soon as possible',
  '2_4_weeks': '2 to 4 weeks',
  '1_2_months': '1 to 2 months',
  flexible: 'Flexible'
};

const SITE_NAMES = {
  'https://agodev.agonmustafaj.com': 'AgoDev',
  'https://agonmustafaj.com': 'Portfolio',
  'https://www.agonmustafaj.com': 'Portfolio'
};

function parseAllowedOrigins(env) {
  const raw = readSecret(env, 'ALLOWED_ORIGINS') || Object.keys(SITE_NAMES).join(',');
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin, allowed) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    Vary: 'Origin'
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(extraHeaders || {})
    }
  });
}

function field(body, key, max) {
  return String(body[key] == null ? '' : body[key]).trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelValue(map, key, empty) {
  if (!key) return empty || 'Not provided';
  return map[key] || key;
}

function buildRows(data) {
  return [
    { label: 'Project type', value: labelValue(PROJECT_TYPES, data.projectType, '-') },
    { label: 'Name', value: data.name },
    { label: 'Email', value: data.email },
    { label: 'Phone', value: data.phone },
    { label: 'Budget', value: labelValue(BUDGETS, data.budget) },
    { label: 'Timeline', value: labelValue(TIMELINES, data.timeline) },
    { label: 'Message', value: data.message }
  ];
}

function textBody(rows, meta) {
  return rows.map((row) => row.label + ': ' + row.value).join('\n') + '\n\n' + meta;
}

/**
 * Branded HTML for Resend. Colors match portfolio/AgoDev dark theme
 * (--bg-primary, --bg-elevated, --accent-blue, --accent-text, --text-muted).
 * Inline table layout for email clients. No em dashes in copy.
 */
function htmlBody(rows, meta, site) {
  const brand = escapeHtml(site || 'AgoDev');
  const font =
    "Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Helvetica Neue,Helvetica,Arial,sans-serif";
  const rowHtml = rows
    .map((row, index) => {
      const border =
        index === 0
          ? ''
          : 'border-top:1px solid rgba(255,255,255,0.12);';
      let value;
      if (row.label === 'Email' && row.value) {
        value =
          '<a href="mailto:' +
          encodeURIComponent(row.value).replace(/%40/g, '@') +
          '" style="color:#c5daf8;font-weight:600;text-decoration:none;">' +
          escapeHtml(row.value) +
          '</a>';
      } else if (row.label === 'Message') {
        value =
          '<span style="color:#ffffff;font-weight:500;white-space:pre-wrap;">' +
          escapeHtml(row.value) +
          '</span>';
      } else {
        value =
          '<span style="color:#ffffff;font-weight:600;">' +
          escapeHtml(row.value) +
          '</span>';
      }
      return (
        '<tr>' +
          '<td style="padding:14px 0;' +
          border +
          'vertical-align:top;">' +
            '<div style="color:#9a9a9a;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;line-height:1.4;margin:0 0 6px 0;font-family:ui-monospace,Cascadia Mono,Consolas,monospace;">' +
              escapeHtml(row.label) +
            '</div>' +
            '<div style="color:#ffffff;font-size:15px;line-height:1.55;">' +
              value +
            '</div>' +
          '</td>' +
        '</tr>'
      );
    })
    .join('');

  return (
    '<div style="margin:0;padding:0;background:#000000;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000000;margin:0;padding:0;width:100%;">' +
        '<tr>' +
          '<td style="padding:28px 16px;font-family:' +
          font +
          ';">' +
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.16);">' +
              '<tr>' +
                '<td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(135deg,#2456a0 0%,#16325c 100%);">&nbsp;</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="padding:28px 28px 8px 28px;">' +
                  '<p style="margin:0 0 6px 0;color:#c5daf8;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;font-family:ui-monospace,Cascadia Mono,Consolas,monospace;">' +
                    brand +
                  '</p>' +
                  '<h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;font-weight:700;">' +
                    'New contact message' +
                  '</h1>' +
                  '<p style="margin:10px 0 0 0;color:rgba(255,255,255,0.62);font-size:14px;line-height:1.5;">' +
                    'A project inquiry was submitted from your site.' +
                  '</p>' +
                '</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="padding:12px 28px 8px 28px;">' +
                  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">' +
                    rowHtml +
                  '</table>' +
                '</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="padding:20px 28px 28px 28px;border-top:1px solid rgba(255,255,255,0.12);">' +
                  '<p style="margin:0;color:#9a9a9a;font-size:12px;line-height:1.5;">' +
                    escapeHtml(meta) +
                  '</p>' +
                '</td>' +
              '</tr>' +
            '</table>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</div>'
  );
}

async function sendWithResend(env, mail) {
  const apiKey = readSecret(env, 'RESEND_API_KEY');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: mail.fromName + ' <' + mail.fromAddress + '>',
      to: [mail.to],
      reply_to: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error('Resend ' + res.status + ': ' + detail.slice(0, 300));
  }
}

async function handleContact(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseAllowedOrigins(env);
  const cors = corsHeaders(origin, allowed);
  const missing = missingSecrets(env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === 'GET') {
    // `missing` lists binding NAMES only (never secret values) so Agon can see
    // which Production Secrets did not bind after deploy.
    return json(200, {
      ok: true,
      service: 'agodev-contact',
      configured: missing.length === 0,
      missing,
      hasAssets: Boolean(runtimeEnv(env).ASSETS)
    }, cors);
  }

  if (request.method !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed' }, {
      ...cors,
      Allow: 'GET, POST, OPTIONS'
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(400, { success: false, message: 'Invalid JSON body.' }, cors);
  }

  if (body.botcheck) {
    return json(200, { success: true }, cors);
  }

  const name = field(body, 'name', 200).replace(/[\r\n]+/g, ' ');
  const email = field(body, 'email', 320);
  const phone = field(body, 'phone', 60);
  const projectType = field(body, 'projectType', 40);
  const budget = field(body, 'budget', 40);
  const timeline = field(body, 'timeline', 40);
  const message = field(body, 'message', 5000);

  if (!name || !phone || !message || !EMAIL_RE.test(email) || !PROJECT_TYPES[projectType]) {
    return json(400, {
      success: false,
      message: 'Name, a valid email, phone, project type and a message are required.'
    }, cors);
  }

  if (budget && !BUDGETS[budget]) {
    return json(400, { success: false, message: 'Invalid budget selection.' }, cors);
  }
  if (timeline && !TIMELINES[timeline]) {
    return json(400, { success: false, message: 'Invalid timeline selection.' }, cors);
  }

  if (missing.length) {
    console.error('Missing secrets:', missing.join(', '));
    return json(500, {
      success: false,
      message: 'Email is not configured.',
      missing
    }, cors);
  }

  const contactTo = readSecret(env, 'CONTACT_TO');
  const contactFrom = parseFromAddress(readSecret(env, 'CONTACT_FROM'));
  if (!EMAIL_RE.test(contactFrom)) {
    console.error('CONTACT_FROM is not a valid email');
    return json(500, {
      success: false,
      message: 'Email is not configured.',
      missing: ['CONTACT_FROM']
    }, cors);
  }

  const site = SITE_NAMES[origin] || 'AgoDev';
  const rows = buildRows({ name, email, phone, projectType, budget, timeline, message });
  const pagePath = request.headers.get('Referer') || origin || 'https://agodev.agonmustafaj.com/';
  const meta = 'Forma: Kontakt · Faqja: ' + site + ' · ' + pagePath;

  try {
    await sendWithResend(env, {
      fromName: site + ' faqja',
      fromAddress: contactFrom,
      to: contactTo,
      replyTo: email,
      subject: 'Mesazh nga faqja: ' + name,
      text: textBody(rows, meta),
      html: htmlBody(rows, meta, site)
    });
    return json(200, { success: true }, cors);
  } catch (err) {
    console.error('send failed:', err && err.message);
    return json(502, { success: false, message: 'The message could not be sent.' }, cors);
  }
}


function withHtmlSeoHeaders(response, requestUrl) {
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  const canonical = new URL('/', requestUrl).origin + '/';
  headers.set('Link', '<' + canonical + '>; rel="canonical"');
  headers.set('Content-Signal', 'search=yes, ai-train=no');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/api/contact') {
      return handleContact(request, env);
    }
    const assets = runtimeEnv(env).ASSETS;
    if (!assets || typeof assets.fetch !== 'function') {
      return new Response('ASSETS binding missing', { status: 500 });
    }
    const response = await assets.fetch(request);
    return withHtmlSeoHeaders(response, url);
  }
};
