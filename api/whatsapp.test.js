const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSalesVerificationMessage } = require('./whatsapp');

test('buildSalesVerificationMessage includes full customer and order details', () => {
  const message = buildSalesVerificationMessage(
    {
      tx_ref: 'NL-1234',
      amount: '100000',
      currency: 'NGN',
      payment_type: 'card',
      customer: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '08012345678'
      },
      meta: {
        customerName: 'Ada Lovelace',
        customerEmail: 'ada@example.com',
        orderItems: [{ name: 'Cloak White', quantity: 1 }]
      }
    },
    {
      orderCode: 'ORD-1001',
      order: { orderCode: 'ORD-1001' },
      customerPhone: '08012345678',
      shippingAddress: '14, Victoria Island, Lagos',
      orderItems: [{ name: 'Cloak White', quantity: 1 }]
    }
  );

  assert.match(message, /NORDLUXE SALES VERIFICATION/);
  assert.match(message, /Ada Lovelace/);
  assert.match(message, /ada@example.com/);
  assert.match(message, /08012345678/);
  assert.match(message, /14, Victoria Island, Lagos/);
  assert.match(message, /ORD-1001/);
  assert.match(message, /Cloak White/);
});
