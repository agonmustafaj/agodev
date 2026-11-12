'use strict';

const crypto = require('crypto');
const { requirePayseraEnv, extractPaymentId } = require('../lib/paysera');
const { findByMerchantOrPayseraId, updateOrder } = require('../lib/orders-store');

// Need the raw body for HMAC verification (do not re-serialize JSON).
module.exports.config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
    const chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(String(signature), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (e) {
    return res.status(400).send('Could not read body');
  }

  let secret;
  try {
    secret = requirePayseraEnv().clientSecret;
  } catch (e) {
    console.error('callback missing Paysera secret');
    return res.status(500).send('Not configured');
  }

  const signature = req.headers['x-paysera-signature'] || '';
  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  const orderBlock = payload.order || {};
  const merchantOrderId = orderBlock.merchant_order_id || null;
  const payseraOrderId = orderBlock.paysera_order_id || orderBlock.order_id || null;
  const orderStatus = orderBlock.status || null;
  const isTest = orderBlock.is_test === true || payload.is_test === true;

  // Only the signature-verified callback may mark an order paid.
  // Branch on order.status from the snapshot (Checkout Modern guidance).
  if (orderStatus === 'paid') {
    const existing = await findByMerchantOrPayseraId(merchantOrderId, payseraOrderId);
    if (!existing) {
      console.error('callback: unknown order', merchantOrderId, payseraOrderId);
      // Acknowledge so Paysera does not keep retrying forever for an unknown test id.
      return res.status(200).send('OK');
    }
    if (existing.status !== 'paid') {
      const paymentId = extractPaymentId(payload);
      await updateOrder(existing.id, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        payseraOrderId: payseraOrderId || existing.payseraOrderId,
        payseraPaymentId: paymentId || existing.payseraPaymentId,
        isTest: isTest || existing.isTest
      });
    } else if (!existing.payseraPaymentId) {
      const paymentId = extractPaymentId(payload);
      if (paymentId) {
        await updateOrder(existing.id, { payseraPaymentId: paymentId });
      }
    }
  } else if (payload.event && payload.event.type === 'payment') {
    // Thin payment event: store payment id when settled; do not mark paid unless order says so.
    const payment = payload.payment || {};
    if (payment.id && (payment.status === 'settled' || payment.status === 'paid')) {
      const existing = await findByMerchantOrPayseraId(merchantOrderId, payseraOrderId);
      if (existing && !existing.payseraPaymentId) {
        await updateOrder(existing.id, {
          payseraPaymentId: String(payment.id),
          payseraOrderId: payseraOrderId || existing.payseraOrderId
        });
      }
    }
  }

  return res.status(200).send('OK');
};
