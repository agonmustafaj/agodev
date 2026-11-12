'use strict';

const { listOrders, redisConfigured } = require('../lib/orders-store');
const { TEST_PRODUCT } = require('../lib/paysera');

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
    const orders = await listOrders();
    return res.status(200).json({
      success: true,
      product: TEST_PRODUCT,
      storage: redisConfigured() ? 'upstash-redis' : (process.env.VERCEL ? 'unconfigured' : 'local-file'),
      orders: orders
    });
  } catch (err) {
    console.error('orders list failed:', err && err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list orders' });
  }
};
