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

function mapPayseraStatus(status) {
  if (status === 'paid') return 'paid';
  if (status === 'canceled' || status === 'cancelled' || status === 'closed') return status;
  return 'unpaid';
}

function extractPaymentIdFromOrder(order) {
  if (!order) return null;
  return extractPaymentId({ order: order });
}

async function listPayseraOrders(accessToken, { referencePrefix, size }) {
  const params = new URLSearchParams();
  params.set('size', String(size || 50));
  params.set('order_direction', 'desc');
  if (referencePrefix) params.set('q', referencePrefix);
  const response = await fetch(ORDERS_URL + '?' + params.toString(), {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error('Paysera list orders failed (' + response.status + '): ' + text.slice(0, 400));
    err.status = 502;
    throw err;
  }
  return JSON.parse(text);
}

async function getPayseraOrder(accessToken, payseraOrderId) {
  const response = await fetch(ORDERS_URL + '/' + encodeURIComponent(payseraOrderId), {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error('Paysera get order failed (' + response.status + '): ' + text.slice(0, 400));
    err.status = 502;
    throw err;
  }
  return JSON.parse(text);
}

function normalizePayseraListItem(item, localByRef) {
  const reference = item.reference || item.purchase && item.purchase.reference || null;
  const payseraOrderId = item.id || item.order_id || null;
  const amountCents = item.amount != null
    ? item.amount
    : (item.purchase && item.purchase.amount);
  const currency = item.currency || (item.purchase && item.purchase.currency) || 'EUR';
  const status = mapPayseraStatus(item.status);
  const local = (reference && localByRef[reference]) ||
    (payseraOrderId && localByRef['paysera:' + payseraOrderId]) ||
    null;
  const createdAt = item.created_at
    ? new Date(Number(item.created_at) * 1000).toISOString()
    : (local && local.createdAt) || null;
  const paidAt = item.payment_accepted_at
    ? new Date(Number(item.payment_accepted_at) * 1000).toISOString()
    : (local && local.paidAt) || null;

  return {
    id: reference || (local && local.id) || payseraOrderId,
    productSku: TEST_PRODUCT.sku,
    productName: TEST_PRODUCT.name,
    amountCents: amountCents != null ? amountCents : TEST_PRODUCT.amountCents,
    currency: currency,
    status: local && local.callbackVerified && local.status === 'paid' ? 'paid' : status,
    payseraOrderId: payseraOrderId,
    payseraPaymentId: (local && local.payseraPaymentId) || null,
    paymentLinkId: (local && local.paymentLinkId) || null,
    callbackVerified: !!(local && local.callbackVerified),
    isTest: local ? local.isTest !== false : true,
    createdAt: createdAt,
    paidAt: status === 'paid' ? paidAt : (local && local.paidAt) || null,
    updatedAt: (local && local.updatedAt) || paidAt || createdAt
  };
}

module.exports = {
  TEST_PRODUCT,
  siteUrl,
  requirePayseraEnv,
  getAccessToken,
  createPayseraOrder,
  createPaymentLink,
  extractPaymentId,
  extractPaymentIdFromOrder,
  listPayseraOrders,
  getPayseraOrder,
  normalizePayseraListItem,
  mapPayseraStatus
};

