'use strict';

const { listLocalOrders, storageMode } = require('../lib/orders-store');
const {
  TEST_PRODUCT,
  getAccessToken,
  listPayseraOrders,
  getPayseraOrder,
  normalizePayseraListItem,
  extractPaymentIdFromOrder
} = require('../lib/paysera');

function authorized(req) {
  const expected = process.env.PAYSERA_DASHBOARD_TOKEN;
  if (!expected) return true;
  const header = req.headers.authorization || '';
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
  const query = (req.query && req.query.token) || '';
  return bearer === expected || query === expected;
}

function indexLocal(localOrders) {
  const map = {};
  (localOrders || []).forEach(function (o) {
    if (!o) return;
    if (o.id) map[o.id] = o;
    if (o.payseraOrderId) map['paysera:' + o.payseraOrderId] = o;
  });
  return map;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!authorized(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const localOrders = await listLocalOrders();
    const localByRef = indexLocal(localOrders);
    let orders = localOrders.slice();
    let source = storageMode();

    try {
      const accessToken = await getAccessToken();
      const listed = await listPayseraOrders(accessToken, { referencePrefix: 'TEST-', size: 50 });
      const items = Array.isArray(listed.items) ? listed.items : (Array.isArray(listed) ? listed : []);
      const normalized = [];
      for (let i = 0; i < items.length; i++) {
        let row = normalizePayseraListItem(items[i], localByRef);
        if (row.status === 'paid' && !row.payseraPaymentId && row.payseraOrderId) {
          try {
            const full = await getPayseraOrder(accessToken, row.payseraOrderId);
            const paymentId = extractPaymentIdFromOrder(full) ||
              extractPaymentIdFromOrder({
                payment_links: full.payment_links,
                status: full.status
              });
            if (paymentId) row.payseraPaymentId = paymentId;
            // Prefer callback-verified local paid flag when present.
            if (localByRef[row.id] && localByRef[row.id].callbackVerified) {
              row.callbackVerified = true;
              row.status = 'paid';
              if (localByRef[row.id].payseraPaymentId) {
                row.payseraPaymentId = localByRef[row.id].payseraPaymentId;
              }
            }
          } catch (e) {
            console.error('getPayseraOrder soft-fail:', e && e.message);
          }
        }
        normalized.push(row);
      }

      // Include local-only rows not yet visible in Paysera list.
      const seen = {};
      normalized.forEach(function (o) {
        if (o.id) seen[o.id] = true;
        if (o.payseraOrderId) seen['paysera:' + o.payseraOrderId] = true;
      });
      localOrders.forEach(function (o) {
        if (!o) return;
        if (seen[o.id] || (o.payseraOrderId && seen['paysera:' + o.payseraOrderId])) return;
        normalized.unshift(o);
      });

      orders = normalized;
      source = storageMode() + '+paysera-api';
    } catch (e) {
      // Without Paysera credentials, fall back to local/memory list.
      console.error('orders Paysera sync soft-fail:', e && e.message);
    }

    return res.status(200).json({
      success: true,
      product: TEST_PRODUCT,
      storage: source,
      orders: orders
    });
  } catch (err) {
    console.error('orders list failed:', err && err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list orders' });
  }
};
