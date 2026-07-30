const WHATSAPP_API_URL = 'https://api.twilio.com/2010-04-01/Accounts';

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeWhastappNumber(value) {
  const raw = normalizeText(value);
  if (!raw) return '';

  const rawWithoutPrefix = raw.replace(/^whatsapp:/i, '').replace(/^https?:\/\/wa\.me\//i, '');
  const digits = rawWithoutPrefix.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('234')) {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 11) {
    return `+234${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `+234${digits}`;
  }

  return `+${digits}`;
}

function formatWhatsAppAddress(value) {
  const normalized = normalizeWhastappNumber(value);
  if (!normalized) return '';
  return normalized.startsWith('whatsapp:') ? normalized : `whatsapp:${normalized}`;
}

function buildSalesVerificationMessage(paymentData, context = {}) {
  const paymentMeta = paymentData && typeof paymentData === 'object' ? paymentData.meta || {} : {};
  const customer = paymentData && typeof paymentData === 'object' ? paymentData.customer || {} : {};
  const order = context && typeof context === 'object' ? context.order || context : {};
  const items = Array.isArray(context.orderItems) ? context.orderItems : Array.isArray(paymentMeta.orderItems) ? paymentMeta.orderItems : [];
  const customerName = normalizeText(paymentMeta.customerName || customer.name || context.customerName || 'N/A');
  const customerEmail = normalizeText(paymentMeta.customerEmail || customer.email || context.customerEmail || 'N/A');
  const customerPhone = normalizeText(customer.phone || context.customerPhone || 'Not provided');
  const address = normalizeText(context.shippingAddress || context.address || 'Not provided');
  const orderCode = normalizeText(context.orderCode || order.orderCode || paymentData.tx_ref || 'N/A');
  const amount = normalizeText(paymentData && paymentData.amount ? String(paymentData.amount) : 'N/A');
  const currency = normalizeText(paymentData && paymentData.currency ? String(paymentData.currency) : 'NGN');
  const paymentMethod = normalizeText(paymentData && paymentData.payment_type ? String(paymentData.payment_type) : 'N/A');
  const itemsText = items.length
    ? items.map((item) => `${item && item.name ? item.name : 'Item'} x${item && item.quantity ? item.quantity : 1}`).join(', ')
    : 'No item list provided';

  return [
    'NORDLUXE SALES VERIFICATION',
    `Customer: ${customerName}`,
    `Email: ${customerEmail}`,
    `Phone: ${customerPhone}`,
    `Address: ${address}`,
    `Order ID: ${orderCode}`,
    `Amount: ${currency} ${amount}`,
    `Payment Method: ${paymentMethod}`,
    `Items: ${itemsText}`,
    `Reference: ${normalizeText(paymentData && paymentData.tx_ref ? String(paymentData.tx_ref) : 'N/A')}`
  ].join('\n');
}

async function sendSalesVerificationWhatsApp(paymentData, context = {}) {
  const sid = normalizeText(process.env.TWILIO_ACCOUNT_SID);
  const authToken = normalizeText(process.env.TWILIO_AUTH_TOKEN);
  const from = formatWhatsAppAddress(process.env.TWILIO_WHATSAPP_FROM);
  const to = formatWhatsAppAddress(process.env.WHATSAPP_TO_NUMBER || process.env.WHATSAPP_ADMIN_NUMBER);

  if (!sid || !authToken || !from || !to) {
    console.warn('[WHATSAPP] WhatsApp delivery not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, and WHATSAPP_TO_NUMBER.');
    return { sent: false, reason: 'missing-config' };
  }

  const message = buildSalesVerificationMessage(paymentData, context);
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: message
  });

  const response = await fetch(`${WHATSAPP_API_URL}/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Twilio WhatsApp send failed (${response.status}): ${responseText}`);
  }

  return { sent: true, response: responseText };
}

module.exports = {
  buildSalesVerificationMessage,
  sendSalesVerificationWhatsApp,
  normalizeWhastappNumber,
  formatWhatsAppAddress
};
