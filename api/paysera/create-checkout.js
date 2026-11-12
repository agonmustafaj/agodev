'use strict';

const {
  TEST_PRODUCT,
  getAccessToken,
  createPayseraOrder,
  createPaymentLink
} = require('../lib/paysera');
const { createUnpaidOrder, updateOrder } = require('../lib/orders-store');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Amount comes only from the server-side TEST_PRODUCT (€1), never from the client body.
    const localOrder = await createUnpaidOrder(TEST_PRODUCT);
    const accessToken = await getAccessToken();
    const payseraOrder = await createPayseraOrder(accessToken, {
      merchantOrderId: localOrder.id,
      amountCents: TEST_PRODUCT.amountCents,
      currency: TEST_PRODUCT.currency
    });
    const payseraOrderId = payseraOrder.order_id;
    const link = await createPaymentLink(accessToken, {
      payseraOrderId: payseraOrderId,
      merchantOrderId: localOrder.id,
      amountCents: TEST_PRODUCT.amountCents
    });
    const paymentUrl = link.payment_URL || link.payment_url;
    if (!paymentUrl) {
      return res.status(502).json({ success: false, message: 'Paysera did not return a payment_URL' });
    }

    await updateOrder(localOrder.id, {
      payseraOrderId: payseraOrderId,
      paymentLinkId: link.link_id || null,
      status: 'unpaid'
    });

    return res.status(200).json({
      success: true,
      orderId: localOrder.id,
      amountCents: TEST_PRODUCT.amountCents,
      currency: TEST_PRODUCT.currency,
      paymentUrl: paymentUrl
    });
  } catch (err) {
    console.error('create-checkout failed:', err && err.message);
    const status = (err && err.status) || 500;
    return res.status(status).json({
      success: false,
      message: (err && err.message) || 'Could not start checkout'
    });
  }
};
