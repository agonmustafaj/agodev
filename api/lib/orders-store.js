'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCAL_FILE = path.join(__dirname, '..', '..', 'data', 'paysera-orders.json');
const REDIS_KEY = 'agodev:paysera-test:orders';

function newOrderId() {
  return 'TEST-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex');
}

function redisConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error('Upstash Redis error (' + response.status + '): ' + text.slice(0, 300));
  }
  const data = await response.json();
  return data.result;
}

function readLocal() {
  try {
    const raw = fs.readFileSync(LOCAL_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
}

function writeLocal(orders) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(orders, null, 2) + '\n', 'utf8');
}

async function listOrders() {
  if (redisConfigured()) {
    const raw = await redisCommand(['GET', REDIS_KEY]);
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  }
  return readLocal();
}

async function saveOrders(orders) {
  if (redisConfigured()) {
    await redisCommand(['SET', REDIS_KEY, JSON.stringify(orders)]);
    return;
  }
  // On Vercel the filesystem is ephemeral — require Redis for durable store.
  if (process.env.VERCEL) {
    const err = new Error(
      'Order persistence needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN on Vercel'
    );
    err.status = 500;
    throw err;
  }
  writeLocal(orders);
}

async function createUnpaidOrder(product) {
  const orders = await listOrders();
  const order = {
    id: newOrderId(),
    productSku: product.sku,
    productName: product.name,
    amountCents: product.amountCents,
    currency: product.currency,
    status: 'unpaid',
    payseraOrderId: null,
    payseraPaymentId: null,
    paymentLinkId: null,
    isTest: true,
    createdAt: new Date().toISOString(),
    paidAt: null,
    updatedAt: new Date().toISOString()
  };
  orders.unshift(order);
  await saveOrders(orders);
  return order;
}

async function updateOrder(id, patch) {
  const orders = await listOrders();
  const idx = orders.findIndex(function (o) { return o.id === id; });
  if (idx === -1) return null;
  orders[idx] = Object.assign({}, orders[idx], patch, { updatedAt: new Date().toISOString() });
  await saveOrders(orders);
  return orders[idx];
}

async function findByMerchantOrPayseraId(merchantOrderId, payseraOrderId) {
  const orders = await listOrders();
  return orders.find(function (o) {
    return (merchantOrderId && o.id === merchantOrderId) ||
      (payseraOrderId && o.payseraOrderId === payseraOrderId);
  }) || null;
}

module.exports = {
  listOrders,
  createUnpaidOrder,
  updateOrder,
  findByMerchantOrPayseraId,
  redisConfigured
};
