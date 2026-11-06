const nodemailer = require('nodemailer');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITES = {
  'https://agodev.agonmustafaj.com': 'AgoDev',
  'https://agonmustafaj.com': 'Portfolio',
  'https://www.agonmustafaj.com': 'Portfolio'
};

function field(body, key, max) {
  return String(body[key] == null ? '' : body[key]).trim().slice(0, max);
}

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  try { return JSON.parse(body || '{}'); } catch (e) { return {}; }
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const site = SITES[origin] || 'AgoDev';
  if (SITES[origin]) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const body = parseBody(req.body);
  if (body.botcheck) return res.status(200).json({ success: true });

  const name = field(body, 'name', 200).replace(/[\r\n]+/g, ' ');
  const email = field(body, 'email', 320);
  const message = field(body, 'message', 5000);
  if (!name || !message || !EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, message: 'Name, a valid email and a message are required.' });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error('GMAIL_USER or GMAIL_APP_PASSWORD is not set');
    return res.status(500).json({ success: false, message: 'Email is not configured.' });
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

  try {
    await transporter.sendMail({
      from: { name: site + ' website', address: user },
      to: process.env.CONTACT_TO || user,
      replyTo: { name, address: email },
      subject: site + ': ' + name,
      text: 'Name: ' + name + '\nEmail: ' + email + '\n\n' + message + '\n\nSent from ' + (req.headers.referer || origin || 'the website')
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('sendMail failed:', err && err.message);
    return res.status(502).json({ success: false, message: 'The message could not be sent.' });
  }
};
