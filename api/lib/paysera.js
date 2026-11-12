'use strict';

const AUTH_URL = 'https://api.paysera.com/auth/realms/Paysera/protocol/openid-connect/token';
const ORDERS_URL = 'https://api.paysera.com/merchant-order/integration/v1/orders';
const LINKS_URL = 'https://api.paysera.com/checkout-payment-link/integration/v1/payment-links';

/** Fixed €1 test product — amount is never taken from the client. */
const TEST_PRODUCT = Object.freeze({
  sku: 'paysera-test-1eur',
  name: 'AgoDev Paysera test (€1)',
  amountCents: 100,
  currency: 'EUR'
});

function siteUrl() {
  return String(process.env.SITE_URL || 'https://agodev.agonmustafaj.com').replace(/\/$/, '');
}

function requirePayseraEnv() {
  const clientId = process.env.PAYSERA_CLIENT_ID;
  const clientSecret = process.env.PAYSERA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error('PAYSERA_CLIENT_ID and PAYSERA_CLIENT_SECRET must be set');
    err.status = 500;
    throw err;
  }
  return { clientId, clientSecret };
}

async function getAccessToken() {
  const { clientId, clientSecret } = requirePayseraEnv();
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!response.ok) {
    const text = await response.text();
    const err = new Error('Paysera auth failed: ' + text.slice(0, 300));
    err.status = 502;
    throw err;
  }
  const data = await response.json();
  return data.access_token;
}

async function createPayseraOrder(accessToken, { merchantOrderId, amountCents, currency }) {
  const base = siteUrl();
  const response = await fetch(ORDERS_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      redirect_urls: {
        success_url: base + '/paysera-test/thanks/?order=' + encodeURIComponent(merchantOrderId),
        failure_url: base + '/paysera-test/?failed=1&order=' + encodeURIComponent(merchantOrderId),
        callback_url: base + '/api/paysera/callback'
      },
      purchase: {
        reference: merchantOrderId,
        amount: amountCents,
        currency: currency
      }
    })
  });
  const text = await response.text();
  if (response.status !== 201 && response.status !== 200) {
    const err = new Error('Paysera create order failed (' + response.status + '): ' + text.slice(0, 400));
    err.status = 502;
    throw err;
  }
  return JSON.parse(text);
}

async function createPaymentLink(accessToken, { payseraOrderId, merchantOrderId, amountCents }) {
  const response = await fetch(LINKS_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      order_id: payseraOrderId,
      name: 'AgoDev test ' + merchantOrderId,
      lifetime: 3600,
      experience: {
        language: 'en',
        payment_flow: 'paysera_checkout'
      },
      purchase: {
        amount: amountCents
      },
      payment_details: {
        purpose: 'AgoDev €1 Paysera Test Mode order ' + merchantOrderId
      }
    })
  });
  const text = await response.text();
  if (response.status !== 201 && response.status !== 200) {
    const err = new Error('Paysera create payment link failed (' + response.status + '): ' + text.slice(0, 400));
    err.status = 502;
    throw err;
  }
  return JSON.parse(text);
}

function extractPaymentId(payload) {
  if (payload && payload.payment && payload.payment.id) return String(payload.payment.id);
  const order = payload && payload.order;
  if (!order) return null;
  const links = Array.isArray(order.payment_links) ? order.payment_links : [];
  for (let i = 0; i < links.length; i++) {
    const payments = Array.isArray(links[i].payments) ? links[i].payments : [];
    for (let j = 0; j < payments.length; j++) {
      const p = payments[j];
      if (p && p.id && (p.status === 'settled' || p.status === 'paid' || order.status === 'paid')) {
        return String(p.id);
      }
    }
  }
  for (let i = 0; i < links.length; i++) {
    const payments = Array.isArray(links[i].payments) ? links[i].payments : [];
    if (payments[0] && payments[0].id) return String(payments[0].id);
  }
  return null;
}

module.exports = {
  TEST_PRODUCT,
  siteUrl,
  requirePayseraEnv,
  getAccessToken,
  createPayseraOrder,
  createPaymentLink,
  extractPaymentId
};
