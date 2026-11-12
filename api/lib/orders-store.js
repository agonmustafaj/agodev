'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCAL_FILE = path.join(__dirname, '..', '..', 'data', 'paysera-orders.json');
const REDIS_KEY = 'agodev:paysera-test:orders';

// Soft in-process cache (helps warm Vercel instances; Paysera remains durable source).
const memory = globalThis.__agodevPayseraOrders || (globalThis.__agodevPayseraOrders = new Map());

function newOrderId() {
  return 'TEST-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex');
}

function redisConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function storageMode() {
  if (redisConfigured()) return 'upstash-redis';
  if (process.env.VERCEL) return 'memory+paysera';
  return 'local-file';
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

function memoryList() {
  return Array.from(memory.values()).sort(function (a, b) {
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });
}

function memoryUpsert(order) {
  memory.set(order.id, order);
  return order;
}

async function listLocalOrders() {
  if (redisConfigured()) {
    const raw = await redisCommand(['GET', REDIS_KEY]);
    if (!raw) return memoryList();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const list = Array.isArray(parsed) ? parsed : [];
    list.forEach(function (o) { if (o && o.id) memory.set(o.id, o); });
    return list.length ? list : memoryList();
  }
  if (!process.env.VERCEL) {
    const list = readLocal();
    list.forEach(function (o) { if (o && o.id) memory.set(o.id, o); });
    return list.length ? list : memoryList();
  }
  return memoryList();
}

async function saveLocalOrders(orders) {
  orders.forEach(function (o) { if (o && o.id) memory.set(o.id, o); });
  if (redisConfigured()) {
    await redisCommand(['SET', REDIS_KEY, JSON.stringify(orders)]);
    return;
  }
  if (!process.env.VERCEL) {
    writeLocal(orders);
  }
  // On Vercel without Redis: memory only. Durable unpaid/paid state lives in Paysera.
}

async function createUnpaidOrder(product) {
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
    callbackVerified: false,
    isTest: true,
    createdAt: new Date().toISOString(),
    paidAt: null,
    updatedAt: new Date().toISOString()
  };
  memoryUpsert(order);
  try {
    const orders = await listLocalOrders();
    const without = orders.filter(function (o) { return o.id !== order.id; });
    without.unshift(order);
    await saveLocalOrders(without);
  } catch (e) {
    // Never block checkout on optional local persistence.
    console.error('createUnpaidOrder persist soft-fail:', e && e.message);
  }
  return order;
}

async function updateOrder(id, patch) {
  let orders;
  try {
    orders = await listLocalOrders();
  } catch (e) {
    orders = memoryList();
  }
  let idx = orders.findIndex(function (o) { return o.id === id; });
  if (idx === -1) {
    const mem = memory.get(id);
    if (!mem) return null;
    orders.unshift(mem);
    idx = 0;
  }
  orders[idx] = Object.assign({}, orders[idx], patch, { updatedAt: new Date().toISOString() });
  memoryUpsert(orders[idx]);
  try {
    await saveLocalOrders(orders);
  } catch (e) {
    console.error('updateOrder persist soft-fail:', e && e.message);
  }
  return orders[idx];
}

async function upsertPaidFromCallback({
  merchantOrderId,
  payseraOrderId,
  payseraPaymentId,
  amountCents,
  currency,
  isTest,
  product
}) {
  const id = merchantOrderId || ('TEST-CB-' + (payseraOrderId || Date.now()));
  let existing = null;
  try {
    existing = await findByMerchantOrPayseraId(merchantOrderId, payseraOrderId);
  } catch (e) {
    existing = memoryList().find(function (o) {
      return (merchantOrderId && o.id === merchantOrderId) ||
        (payseraOrderId && o.payseraOrderId === payseraOrderId);
    }) || null;
  }

  const base = existing || {
    id: id,
    productSku: product.sku,
    productName: product.name,
    amountCents: amountCents != null ? amountCents : product.amountCents,
    currency: currency || product.currency,
    payseraOrderId: payseraOrderId || null,
    paymentLinkId: null,
    isTest: true,
    createdAt: new Date().toISOString()
  };

  return updateOrder(base.id, {
    status: 'paid',
    paidAt: new Date().toISOString(),
    payseraOrderId: payseraOrderId || base.payseraOrderId,
    payseraPaymentId: payseraPaymentId || base.payseraPaymentId || null,
    callbackVerified: true,
    isTest: isTest || base.isTest,
    amountCents: amountCents != null ? amountCents : base.amountCents,
    currency: currency || base.currency
  });
}

async function findByMerchantOrPayseraId(merchantOrderId, payseraOrderId) {
  const orders = await listLocalOrders();
  return orders.find(function (o) {
    return (merchantOrderId && o.id === merchantOrderId) ||
      (payseraOrderId && o.payseraOrderId === payseraOrderId);
  }) || null;
}

module.exports = {
  newOrderId,
  listLocalOrders,
  createUnpaidOrder,
  updateOrder,
  upsertPaidFromCallback,
  findByMerchantOrPayseraId,
  redisConfigured,
  storageMode
};
