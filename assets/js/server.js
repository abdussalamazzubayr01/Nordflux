const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Flutterwave = require('flutterwave-node-v3');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const session = require('express-session');
const { authenticator } = require('otplib');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '1mb';
const REQUEST_PARAMETER_LIMIT = Number(process.env.REQUEST_PARAMETER_LIMIT || 100);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 15000);
const KEEP_ALIVE_TIMEOUT_MS = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000);
const HEADERS_TIMEOUT_MS = Number(process.env.HEADERS_TIMEOUT_MS || 66000);

let isShuttingDown = false;
let server = null;

function resolvePositiveInteger(rawValue, defaultValue) {
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

const safeRequestParameterLimit = resolvePositiveInteger(REQUEST_PARAMETER_LIMIT, 100);

let firebaseAdminAuth = null;
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
    firebaseAdminAuth = admin.auth();
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
  }
}

// Middleware
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors());
app.use(bodyParser.json({ limit: REQUEST_BODY_LIMIT }));
app.use(bodyParser.urlencoded({
  extended: true,
  limit: REQUEST_BODY_LIMIT,
  parameterLimit: safeRequestParameterLimit
}));

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({
      success: false,
      message: 'Server is restarting. Please retry in a few seconds.'
    });
  }
  return next();
});

// Serve static files
app.use(express.static('.'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'nordluxe-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

if (IS_PRODUCTION && process.env.SESSION_SECRET === 'nordluxe-secret') {
  console.warn('SESSION_SECRET is using the default value in production. Set a strong random SESSION_SECRET.');
}

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport strategies (only initialize if credentials are provided)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = new User({
          googleId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName
        });
        await user.save();
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
  passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    callbackURL: '/auth/apple/callback',
    keyID: process.env.APPLE_KEY_ID,
    privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH
  }, async (accessToken, refreshToken, idToken, profile, done) => {
    try {
      let user = await User.findOne({ appleId: profile.id });
      if (!user) {
        user = new User({
          appleId: profile.id,
          email: profile.email,
          name: profile.name
        });
        await user.save();
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Initialize Flutterwave
let flw = null;
try {
  if (process.env.FLUTTERWAVE_PUBLIC_KEY && process.env.FLUTTERWAVE_SECRET_KEY) {
    flw = new Flutterwave(
      process.env.FLUTTERWAVE_PUBLIC_KEY,
      process.env.FLUTTERWAVE_SECRET_KEY
    );
  }
} catch (err) {
  console.warn('[WARN] Flutterwave SDK initialization skipped:', err.message);
}

// Email transporter — port 587 STARTTLS is used instead of 465 SMTPS
// because port 465 is frequently blocked by ISPs and firewalls.
// Gmail requires an App Password when 2-Step Verification is enabled.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false
  }
});

const EMAIL_FROM = process.env.EMAIL_FROM || `NORDLUXE <${process.env.EMAIL_USER || 'noreply@nordluxe.io'}>`;
const ORDERS_FALLBACK_FILE = path.join(__dirname, '..', '..', 'data', 'orders.json');
let mongoReady = false;
const mongoConnectionUri = process.env.MONGODB_URI || process.env.MONGO_URI;

const LIVE_ACTIVITY_TTL_MS = Number(process.env.LIVE_ACTIVITY_TTL_MS || 120000);
const liveSessions = new Map();
const MAX_LIVE_EVENTS = Number(process.env.MAX_LIVE_EVENTS || 5000);
const liveEvents = [];
const confirmationEmailSentTxRefs = new Set();
const internalNotificationSentTxRefs = new Set();

function parseEmailList(rawValue) {
  return Array.from(new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => extractSingleEmail(value))
      .filter(Boolean)
  ));
}

function getInternalNotificationRecipients() {
  return Array.from(new Set([
    ...parseEmailList(process.env.ADMIN_NOTIFICATION_EMAILS),
    ...parseEmailList(process.env.ADMIN_EMAIL),
    ...parseEmailList(process.env.EMAIL_USER)
  ]));
}

function resolveBuyerEmail() {
  for (const candidate of arguments) {
    const resolved = extractSingleEmail(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}

async function sendTransactionalEmail(mailOptions) {
  const normalized = Object.assign({}, mailOptions || {});
  const rawHtml = typeof normalized.html === 'string' ? normalized.html.trim() : '';
  const rawText = typeof normalized.text === 'string' ? normalized.text : '';
  const hasHtmlDocument = /<!doctype\s+html/i.test(rawHtml) || /<html[\s>]/i.test(rawHtml);

  if (rawHtml && !hasHtmlDocument) {
    normalized.html = renderEmailLayout({
      title: normalized.subject || 'NORDLUXE Update',
      subtitle: 'Lagos, Nigeria — Command Every Room',
      preheader: rawText || 'NORDLUXE update',
      contentHtml: rawHtml
    });
  } else if (!rawHtml && rawText) {
    normalized.html = renderEmailLayout({
      title: normalized.subject || 'NORDLUXE Update',
      subtitle: 'Lagos, Nigeria — Command Every Room',
      preheader: rawText,
      contentHtml: `<p style="margin:0;line-height:1.7;">${escapeHtml(rawText).replace(/\n/g, '<br>')}</p>`
    });
  }

  return transporter.sendMail(normalized);
}

async function sendBuyerTransactionalEmail(mailOptions) {
  const buyerEmail = resolveBuyerEmail(mailOptions && mailOptions.to);

  if (!buyerEmail) {
    throw new Error('Missing buyer email recipient.');
  }

  return sendTransactionalEmail(Object.assign({}, mailOptions, { to: buyerEmail }));
}

async function sendInternalTransactionalEmail(mailOptions) {
  const recipients = getInternalNotificationRecipients();

  if (!recipients.length) {
    throw new Error('Missing internal notification recipients. Set ADMIN_NOTIFICATION_EMAILS or ADMIN_EMAIL.');
  }

  return sendTransactionalEmail(Object.assign({}, mailOptions, { to: recipients }));
}

function postJson(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }, headers || {})
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');

      response.on('data', (chunk) => {
        raw += chunk;
      });

      response.on('end', () => {
        if (!raw) {
          return resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            data: null
          });
        }

        try {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            data: JSON.parse(raw)
          });
        } catch (error) {
          reject(new Error(`Invalid JSON response from ${target.hostname}: ${raw.slice(0, 160)}`));
        }
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

// MongoDB connection (optional - for storing orders)
if (mongoConnectionUri) {
  mongoose.connect(mongoConnectionUri)
    .then(() => {
      mongoReady = true;
      console.log('MongoDB connected');
    })
    .catch(err => {
      mongoReady = false;
      console.log('MongoDB connection error:', err);
      console.log('Using fallback file order store:', ORDERS_FALLBACK_FILE);
    });
} else {
  console.log('MONGODB_URI or MONGO_URI not set. Using fallback file order store:', ORDERS_FALLBACK_FILE);
}

// Order Schema with automatic tracking
const orderSchema = new mongoose.Schema({
  customerEmail: String,
  customerName: String,
  orderCode: { type: String, unique: true, sparse: true },
  userId: String,
  items: Array,
  totalAmount: Number,
  paymentPlan: Object,
  flutterwaveRef: String,
  paymentReference: String,
  
  // Status tracking with timestamps for progressive stages
  status: { type: String, enum: ['pending', 'confirmed', 'packed', 'dispatched', 'in-transit', 'delivered', 'received'], default: 'pending' },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  
  // Tracking information
  trackingNumber: String,
  trackingUrl: String,
  shippingCompany: String,

  // Team workflow
  assignedTo: { type: String, default: '' },
  internalNotes: [{
    note: String,
    by: String,
    at: { type: Date, default: Date.now }
  }],
  
  // Customer confirmation
  customerConfirmedReceived: { type: Boolean, default: false },
  confirmedReceivedAt: Date,
  
  // Dates
  createdAt: { type: Date, default: Date.now },
  confirmedAt: Date,
  packedAt: Date,
  dispatchedAt: Date,
  deliveredAt: Date,
  
  // Notifications tracking
  notificationsSent: {
    confirmed: { type: Boolean, default: false },
    packed: { type: Boolean, default: false },
    dispatched: { type: Boolean, default: false },
    inTransit: { type: Boolean, default: false },
    delivered: { type: Boolean, default: false },
    received: { type: Boolean, default: false }
  }
});

const Order = mongoose.model('Order', orderSchema);

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  name: String,
  password: String,
  googleId: String,
  appleId: String,
  otpSecret: String,
  isFirstLogin: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Newsletter Subscriber Schema
const subscriberSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true, trim: true },
  name: { type: String, trim: true },
  subscribedAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value) {
  return String(value || '').trim();
}

const SINGLE_EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function extractSingleEmail(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (/[\r\n,;]/.test(normalized)) return '';
  if (!SINGLE_EMAIL_PATTERN.test(normalized)) return '';
  return normalized;
}

function derivePreferredCustomerName(candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) {
      continue;
    }
    if (/^nordluxe$/i.test(normalized)) {
      continue;
    }
    return normalized;
  }
  return 'Valued Customer';
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function resolveFrontendBaseUrl() {
  const fromEnv = normalizeText(process.env.FRONTEND_URL);
  if (fromEnv) {
    return trimTrailingSlash(fromEnv);
  }
  return `http://localhost:${PORT}`;
}

function resolveAbsoluteAssetUrl(assetPath) {
  const cleanedPath = `/${String(assetPath || '').replace(/^\/+/, '')}`;
  return `${resolveFrontendBaseUrl()}${cleanedPath}`;
}

const emailItemImageMap = {
  'Nordluxe Long Ascension White': '/assets/images/white%20long.png',
  'Nordluxe Short Ascension White': '/assets/images/wite%20short.png',
  'Nordluxe Long Ascension Black': '/assets/images/long%20black.png',
  'Nordluxe Short Ascension Black': '/assets/images/black%20short.png',
  'Cloak White': '/assets/images/cloak%20white.png',
  'Cloak Black': '/assets/images/cloak%20black.png',
  'Nordluxe Full Ascension White Bundle': '/assets/images/cloak%20white.png',
  'Nordluxe Full Ascension Black Bundle': '/assets/images/cloak%20black.png',
  'Full Package (White + Black) Complete Collection': '/assets/images/Full%20package.png'
};

function resolveOrderItemImageUrl(item) {
  if (!item || typeof item !== 'object') {
    return resolveAbsoluteAssetUrl('/assets/images/sa.jpg');
  }

  const directImage = normalizeText(item.image || item.imageUrl || item.img || item.thumbnail || '');
  const hasInvalidDirectImage = /^(undefined|null|nan)$/i.test(directImage)
    || /^\/?(undefined|null|nan)(\/|$)/i.test(directImage)
    || /\bundefined\b/i.test(directImage);

  if (directImage && !hasInvalidDirectImage) {
    if (/^https?:\/\//i.test(directImage)) {
      return directImage;
    }
    return resolveAbsoluteAssetUrl(directImage);
  }

  const itemName = normalizeText(item.name || '');
  const normalizedName = itemName.replace(/\s*\([^)]*\)\s*$/, '');
  const mappedPath = emailItemImageMap[normalizedName] || emailItemImageMap[itemName] || '/assets/images/sa.jpg';
  return resolveAbsoluteAssetUrl(mappedPath);
}

function renderEmailLayout(options) {
  const title = escapeHtml(options && options.title ? options.title : 'NORDLUXE Update');
  const subtitle = escapeHtml(options && options.subtitle ? options.subtitle : 'Lagos, Nigeria — Command Every Room');
  const preheader = escapeHtml(options && options.preheader ? options.preheader : 'NORDLUXE order update');
  const contentHtml = options && options.contentHtml ? options.contentHtml : '';
  const logoUrl = resolveAbsoluteAssetUrl('/assets/images/sa.jpg');
  const year = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f0e8;font-family:Arial,Helvetica,sans-serif;color:#1f1b14;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e8;padding:24px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #e5dbc6;border-radius:14px;overflow:hidden;">
                <tr>
                  <td style="padding:26px 28px;background:linear-gradient(135deg,#19140f,#3c2a18);text-align:center;">
                    <img src="${logoUrl}" alt="NORDLUXE" width="72" height="72" style="display:block;margin:0 auto 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);object-fit:cover;">
                    <div style="color:#f5dfb4;font-size:22px;letter-spacing:1.5px;font-weight:700;">NORDLUXE</div>
                    <div style="color:#dcb87a;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">${subtitle}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#2d1f11;">${title}</h1>
                    ${contentHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px;background:#faf7f1;border-top:1px solid #eee2cf;color:#5e513f;font-size:12px;line-height:1.6;">
                    <div style="font-weight:700;color:#6a4a20;">NORDLUXE</div>
                    <div>Lagos, Nigeria — Command Every Room</div>
                    <div style="margin-top:4px;">© ${year} NORDLUXE. All rights reserved.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function parseMoneyValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function resolveItemUnitPrice(item) {
  if (!item || typeof item !== 'object') return null;

  const candidates = [
    item.depositPrice,
    item.finalPrice,
    item.price,
    item.preorderPrice,
    item.originalPrice,
    item.unitPrice,
    item.lineTotal,
    item.total,
    item.amount
  ];

  for (const candidate of candidates) {
    const parsed = parseMoneyValue(candidate);
    if (parsed !== null && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function formatEmailCurrency(amount, currencyCode) {
  const value = Number.isFinite(amount) ? amount : 0;
  const hasFraction = Math.abs(value % 1) > 0;
  return `${escapeHtml(currencyCode || 'NGN')} ${value.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0
  })}`;
}

function buildGroupedOrderLines(items) {
  const grouped = new Map();
  const list = Array.isArray(items) ? items : [];

  list.forEach((item, index) => {
    const rawName = normalizeText(item && item.name ? item.name : `Item ${index + 1}`) || `Item ${index + 1}`;
    const name = rawName.replace(/\(\s*[A-Za-z]?\s*undefined\s*\)$/i, '').trim() || `Item ${index + 1}`;
    const quantity = Number.isFinite(Number(item && item.quantity)) && Number(item.quantity) > 0
      ? Number(item.quantity)
      : 1;
    const unitPrice = resolveItemUnitPrice(item);
    const key = `${name}::${unitPrice === null ? 'na' : unitPrice.toFixed(2)}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        name,
        quantity: 0,
        unitPrice,
        lineTotal: 0
      });
    }

    const current = grouped.get(key);
    current.quantity += quantity;
    if (!current.imageUrl) {
      current.imageUrl = resolveOrderItemImageUrl(item);
    }
    if (unitPrice !== null) {
      current.lineTotal += unitPrice * quantity;
    }
  });

  return Array.from(grouped.values());
}

function buildOrderItemsTableHtml(items, currencyCode) {
  const lines = buildGroupedOrderLines(items);
  if (!lines.length) {
    return '<p><em>Item breakdown unavailable.</em></p>';
  }

  const hasUnknownLineTotals = lines.some((line) => line.unitPrice === null);
  const grandTotal = lines.reduce((sum, line) => {
    if (line.unitPrice === null) return sum;
    return sum + line.lineTotal;
  }, 0);
  const grandTotalHtml = hasUnknownLineTotals
    ? 'N/A'
    : formatEmailCurrency(grandTotal, currencyCode);

  const rows = lines.map((line) => {
    const unitPriceHtml = line.unitPrice !== null
      ? formatEmailCurrency(line.unitPrice, currencyCode)
      : 'N/A';
    const totalHtml = line.unitPrice !== null
      ? formatEmailCurrency(line.lineTotal, currencyCode)
      : 'N/A';

    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #ececec;width:72px;">
          <img src="${escapeHtml(line.imageUrl || resolveAbsoluteAssetUrl('/assets/images/sa.jpg'))}" alt="${escapeHtml(line.name)}" width="56" height="56" style="display:block;border-radius:8px;object-fit:cover;border:1px solid #e6dcc8;">
        </td>
        <td style="padding:8px;border-bottom:1px solid #ececec;">${escapeHtml(line.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #ececec;text-align:center;">${line.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #ececec;text-align:right;">${unitPriceHtml}</td>
        <td style="padding:8px;border-bottom:1px solid #ececec;text-align:right;">${totalHtml}</td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:10px;">
      <thead>
        <tr style="background:#f3f3f3;">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Image</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Product</th>
          <th style="padding:8px;text-align:center;border-bottom:1px solid #ddd;">Qty</th>
          <th style="padding:8px;text-align:right;border-bottom:1px solid #ddd;">Unit Price</th>
          <th style="padding:8px;text-align:right;border-bottom:1px solid #ddd;">Line Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#fbfbfb;">
          <td colspan="4" style="padding:10px;border-top:2px solid #ddd;text-align:right;font-weight:bold;">Grand Total:</td>
          <td style="padding:10px;border-top:2px solid #ddd;text-align:right;font-weight:bold;">${grandTotalHtml}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function ensureFallbackStore() {
  const dir = path.dirname(ORDERS_FALLBACK_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ORDERS_FALLBACK_FILE)) {
    fs.writeFileSync(ORDERS_FALLBACK_FILE, '[]', 'utf8');
  }
}

function readFallbackOrders() {
  try {
    ensureFallbackStore();
    const raw = fs.readFileSync(ORDERS_FALLBACK_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Fallback order read error:', err.message);
    return [];
  }
}

function writeFallbackOrders(orders) {
  ensureFallbackStore();
  fs.writeFileSync(ORDERS_FALLBACK_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function sortByCreatedDesc(items) {
  return items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function getOrdersForQuery(query) {
  if (mongoReady) {
    return Order.find(query).sort({ createdAt: -1 });
  }

  const list = readFallbackOrders();
  if (query && query.customerEmail instanceof RegExp) {
    return sortByCreatedDesc(list.filter((item) => query.customerEmail.test(String(item.customerEmail || ''))));
  }
  if (query && query.$or && Array.isArray(query.$or)) {
    const uid = query.$or.find((x) => Object.prototype.hasOwnProperty.call(x, 'userId'));
    const email = query.$or.find((x) => x.customerEmail instanceof RegExp);
    return sortByCreatedDesc(list.filter((item) => {
      const uidMatch = uid ? String(item.userId || '') === String(uid.userId || '') : false;
      const emailMatch = email ? email.customerEmail.test(String(item.customerEmail || '')) : false;
      return uidMatch || emailMatch;
    }));
  }
  return sortByCreatedDesc(list);
}

function generateOrderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return `NLX-${token}`;
}

function displayOrderId(order) {
  return order && order.orderCode ? order.orderCode : order._id.toString().slice(-8).toUpperCase();
}

function normalizePagePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  let normalized = raw;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      normalized = new URL(normalized).pathname || '/';
    } catch (err) {
      normalized = '/';
    }
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  return normalized.split('?')[0].split('#')[0] || '/';
}

function cleanupLiveSessions() {
  const cutoff = Date.now() - LIVE_ACTIVITY_TTL_MS;
  for (const [sessionId, entry] of liveSessions.entries()) {
    if (!entry || Number(entry.lastSeenAt || 0) < cutoff) {
      liveSessions.delete(sessionId);
    }
  }
}

function buildLiveAnalyticsSnapshot() {
  cleanupLiveSessions();

  const perPage = {};
  for (const entry of liveSessions.values()) {
    const page = normalizePagePath(entry.page || '/');
    perPage[page] = (perPage[page] || 0) + 1;
  }

  const pages = Object.entries(perPage)
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count);

  return {
    activeVisitors: liveSessions.size,
    pages,
    updatedAt: new Date().toISOString()
  };
}

function pushLiveEvent(event) {
  const normalized = event || {};
  liveEvents.unshift(normalized);
  if (liveEvents.length > MAX_LIVE_EVENTS) {
    liveEvents.length = MAX_LIVE_EVENTS;
  }
}

// Routes

app.post('/api/request-checkout-link', async (req, res) => {
  try {
    const { customer, items, total, currency, notes } = req.body;
    const firstName = normalizeText(customer && customer.firstName);
    const lastName = normalizeText(customer && customer.lastName);
    const email = normalizeText(customer && customer.email);
    const phone = normalizeText(customer && customer.phone);
    const address = normalizeText(customer && customer.address);
    const city = normalizeText(customer && customer.city);
    const state = normalizeText(customer && customer.state);
    const zipCode = normalizeText(customer && customer.zipCode);
    const country = normalizeText(customer && customer.country);

    if (!firstName || !lastName || !email || !phone || !address || !city || !zipCode || !country) {
      return res.status(400).json({
        success: false,
        message: 'Please provide complete customer information'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart items are required'
      });
    }

    const numericTotal = Number(total);
    if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order total'
      });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({
        success: false,
        message: 'Email service is not configured on server'
      });
    }

    const safeNotes = normalizeText(notes);
    const currencyCode = 'NGN';

    const itemsHtml = buildOrderItemsTableHtml(items, currencyCode);

    await sendInternalTransactionalEmail({
      from: EMAIL_FROM,
      subject: 'NORDLUXE - New Checkout Link Request',
      html: renderEmailLayout({
        title: 'New Checkout Request',
        subtitle: 'Store Team Notification',
        preheader: 'A customer requested a secure checkout link.',
        contentHtml: `
          <p style="margin:0 0 14px;line-height:1.7;">A customer requested a checkout link. Please follow up to continue payment.</p>

          <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
            <h3 style="margin:0 0 10px;color:#6e4b1e;">Customer Information</h3>
            <p style="margin:0 0 6px;"><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
            <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>
            <p style="margin:0;"><strong>Address:</strong> ${escapeHtml(address)}, ${escapeHtml(city)}, ${escapeHtml(state || 'N/A')} ${escapeHtml(zipCode)}, ${escapeHtml(country)}</p>
          </div>

          <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
            <h3 style="margin:0 0 10px;color:#6e4b1e;">Order Details</h3>
            <p style="margin:0 0 10px;"><strong>Total:</strong> ${escapeHtml(currencyCode)} ${numericTotal.toFixed(2)}</p>
            ${itemsHtml}
            <p style="margin:12px 0 0;"><strong>Notes:</strong> ${escapeHtml(safeNotes || 'None')}</p>
          </div>
        `
      })
    });

    await sendBuyerTransactionalEmail({
      from: EMAIL_FROM,
      to: email,
      subject: 'NORDLUXE - Checkout Request Received',
      html: renderEmailLayout({
        title: 'Checkout Request Received',
        subtitle: 'Your NORDLUXE Request Is In',
        preheader: 'We received your checkout request and will send your secure payment link shortly.',
        contentHtml: `
          <p style="margin:0 0 14px;line-height:1.7;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin:0 0 14px;line-height:1.7;">Thank you for your order request. Our team will contact you shortly and send your secure checkout link.</p>
          <p style="margin:0 0 14px;line-height:1.7;"><strong>Order total:</strong> ${escapeHtml(currencyCode)} ${numericTotal.toFixed(2)}</p>
          <p style="margin:0;line-height:1.7;">If you need immediate help, reply to this email and our team will assist you.</p>
        `
      })
    });

    res.json({
      success: true,
      message: 'Checkout request sent successfully. We will contact you with your checkout link.'
    });
  } catch (error) {
    console.error('Checkout request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send checkout request',
      error: error.message
    });
  }
});

// Initialize payment
app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { amount, customer, items, paymentPlan, redirect_url } = req.body;
    const customerEmail = extractSingleEmail(customer && customer.email);
    const customerName = normalizeText(customer && customer.name);

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid single customer email address.'
      });
    }

    if (!customerName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the customer name.'
      });
    }

    const payload = {
      tx_ref: `nordluxe-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      amount: amount,
      currency: 'NGN',
      redirect_url: redirect_url || `${process.env.FRONTEND_URL}/thank-you.html`,
      payment_options: 'card,mobilemoney,ussd',
      customer: {
        email: customerEmail,
        phonenumber: customer.phone,
        name: customerName
      },
      meta: {
        paymentType: paymentPlan && paymentPlan.type ? paymentPlan.type : 'standard',
        customerEmail: customerEmail,
        customerName: customerName,
        orderItems: Array.isArray(items) ? items : [],
        depositPercentage: paymentPlan && paymentPlan.depositPercentage ? paymentPlan.depositPercentage : null,
        balancePercentage: paymentPlan && paymentPlan.balancePercentage ? paymentPlan.balancePercentage : null,
        preorderTotal: paymentPlan && typeof paymentPlan.preorderTotal === 'number' ? paymentPlan.preorderTotal : null,
        depositAmount: paymentPlan && typeof paymentPlan.depositAmount === 'number' ? paymentPlan.depositAmount : amount,
        remainingBalance: paymentPlan && typeof paymentPlan.remainingBalance === 'number' ? paymentPlan.remainingBalance : null
      },
      customizations: {
        title: paymentPlan && paymentPlan.type === 'preorder-deposit' ? 'NORDLUXE Preorder Deposit' : 'NORDLUXE Purchase',
        description: paymentPlan && paymentPlan.type === 'preorder-deposit' ? '40% preorder deposit payment' : 'Nigerian Luxury Fashion — Lagos',
        logo: `${process.env.FRONTEND_URL}/sa.jpg`
      }
    };

    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is missing.');
    }

    const flutterwaveResponse = await postJson('https://api.flutterwave.com/v3/payments', payload, {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
    });

    const response = flutterwaveResponse.data;
    if (!flutterwaveResponse.ok || response.status !== 'success') {
      throw new Error(response.message || `Flutterwave request failed with status ${flutterwaveResponse.status}`);
    }

    // Save order (MongoDB when available, fallback file otherwise)
    if (mongoose.connection.readyState === 1) {
      const order = new Order({
        customerEmail: customerEmail,
        customerName: customerName,
        items: items,
        totalAmount: amount,
        paymentPlan: paymentPlan || null,
        flutterwaveRef: payload.tx_ref
      });
      await order.save();
    } else {
      const fallbackOrders = readFallbackOrders();
      fallbackOrders.unshift({
        _id: `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customerEmail: customerEmail,
        customerName: customerName,
        items: Array.isArray(items) ? items : [],
        totalAmount: Number(amount) || 0,
        paymentPlan: paymentPlan || null,
        flutterwaveRef: payload.tx_ref,
        paymentReference: payload.tx_ref,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      writeFallbackOrders(fallbackOrders);
    }

    const responseData = response && response.data ? response.data : null;
    const paymentLink = responseData && responseData.link ? responseData.link : null;

    if (!paymentLink) {
      throw new Error('Flutterwave did not return a hosted payment link.');
    }

    res.json({
      success: true,
      data: {
        link: paymentLink,
        tx_ref: payload.tx_ref,
        raw: responseData
      }
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment initiation failed',
      error: error.message
    });
  }
});

// Verify payment
app.get('/api/verify-payment/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const response = await flw.Transaction.verify({ id: transactionId });

    if (response.data.status === 'successful') {
      // Update order status
      if (mongoose.connection.readyState === 1) {
        await Order.findOneAndUpdate(
          { flutterwaveRef: response.data.tx_ref },
          { status: 'confirmed', confirmedAt: new Date() }
        );
      }

      try {
        await sendOrderConfirmationEmail(response.data);
      } catch (mailErr) {
        console.error('verify-payment buyer confirmation send error:', mailErr && mailErr.message ? mailErr.message : mailErr);
      }

      try {
        await sendPaymentNotificationEmail(response.data);
      } catch (mailErr) {
        console.error('verify-payment internal notification send error:', mailErr && mailErr.message ? mailErr.message : mailErr);
      }

      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: response.data
      });
    } else {
      res.json({
        success: false,
        message: 'Payment not successful',
        data: response.data
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
});

// Flutterwave webhook
app.get('/api/webhook', (req, res) => {
  res.send('Webhook endpoint is live');
});

app.post('/api/webhook', async (req, res) => {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const signature = req.headers['verif-hash'];

  if (!signature || signature !== secretHash) {
    console.log('Warning: Webhook signature validation failed');
    return res.status(401).json({ message: 'Invalid signature' });
  }

  const payload = req.body;
  console.log('Webhook received:', {
    event: payload && payload.event,
    status: payload && payload.data && payload.data.status,
    tx_ref: payload && payload.data && payload.data.tx_ref
  });

  // Verify the event
  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    console.log('Payment completed webhook:', payload.data);

    // Send buyer confirmation from webhook as reliable fallback.
    try {
      console.log('Sending buyer confirmation email from webhook...');
      await sendOrderConfirmationEmail(payload.data);
    } catch (emailErr) {
      console.error('Webhook: Failed to send buyer confirmation email:', {
        error: emailErr && emailErr.message ? emailErr.message : String(emailErr),
        tx_ref: payload && payload.data && payload.data.tx_ref
      });
    }

    // Send notification email
    try {
      console.log('Sending admin notification email from webhook...');
      await sendPaymentNotificationEmail(payload.data);
    } catch (notifErr) {
      console.error('Webhook: Failed to send admin notification email:', {
        error: notifErr && notifErr.message ? notifErr.message : String(notifErr),
        tx_ref: payload && payload.data && payload.data.tx_ref
      });
    }

    // Update order status
    if (mongoose.connection.readyState === 1) {
      Order.findOneAndUpdate(
        { flutterwaveRef: payload.data.tx_ref },
        { status: 'confirmed', confirmedAt: new Date() }
      ).catch(err => console.error('Database update error:', err));
    } else {
      try {
        const fallbackOrders = readFallbackOrders();
        const txRef = normalizeText(payload && payload.data && payload.data.tx_ref);
        const index = fallbackOrders.findIndex((item) => normalizeText(item && item.flutterwaveRef) === txRef);
        if (index >= 0) {
          fallbackOrders[index] = {
            ...fallbackOrders[index],
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          writeFallbackOrders(fallbackOrders);
          console.log('Order status updated in fallback store');
        }
      } catch (err) {
        console.error('Fallback status update error:', err.message);
      }
    }
  } else {
    console.log('Webhook event not processed (not charge.completed or not successful):', {
      event: payload && payload.event,
      status: payload && payload.data && payload.data.status
    });
  }

  res.status(200).json({ status: 'ok' });
});

async function findOrderByFlutterwaveRef(txRef) {
  const normalized = normalizeText(txRef);
  if (!normalized) return null;

  if (mongoReady) {
    const dbOrder = await Order.findOne({ flutterwaveRef: normalized });
    if (dbOrder) return dbOrder;
  }

  const fallbackOrders = readFallbackOrders();
  return fallbackOrders.find((item) => String(item.flutterwaveRef || '') === normalized) || null;
}

// Send order confirmation email
async function sendOrderConfirmationEmail(paymentData) {
  console.log('📬 sendOrderConfirmationEmail called with:', {
    tx_ref: paymentData && paymentData.tx_ref,
    transactionId: paymentData && paymentData.id,
    paymentStatus: paymentData && paymentData.status
  });

  const paymentMeta = paymentData.meta || {};
  const isPreorderDeposit = paymentMeta.paymentType === 'preorder-deposit';
  const txRef = paymentData && paymentData.tx_ref ? String(paymentData.tx_ref).trim() : '';
  const currencyCode = paymentData && paymentData.currency ? String(paymentData.currency) : 'NGN';

  const matchedOrder = txRef ? await findOrderByFlutterwaveRef(txRef) : null;
  const metaOrderItems = Array.isArray(paymentMeta.orderItems) ? paymentMeta.orderItems : [];
  const orderItems = matchedOrder && Array.isArray(matchedOrder.items) && matchedOrder.items.length
    ? matchedOrder.items
    : metaOrderItems;
  const orderedItemsHtml = orderItems.length
    ? buildOrderItemsTableHtml(orderItems, currencyCode)
    : '<p style="margin:0;line-height:1.6;color:#7a6a55;"><em>Item details are being finalized. Your payment has been received successfully.</em></p>';

  if (!orderItems.length) {
    console.warn('Confirmation email continuing without item breakdown', {
      tx_ref: txRef || null,
      transactionId: paymentData && paymentData.id ? paymentData.id : null
    });
  }

  if (txRef && confirmationEmailSentTxRefs.has(txRef)) {
    console.log('⏭️ Skipping duplicate confirmation email send', { tx_ref: txRef });
    return;
  }

  if (txRef) {
    confirmationEmailSentTxRefs.add(txRef);
  }

  let recipientEmail = extractSingleEmail(paymentMeta && paymentMeta.customerEmail);

  if (!recipientEmail) {
    recipientEmail = extractSingleEmail(paymentData && paymentData.customer && paymentData.customer.email);
  }

  if (!recipientEmail && txRef) {
    recipientEmail = extractSingleEmail(matchedOrder && matchedOrder.customerEmail);
  }

  const customerDisplayName = derivePreferredCustomerName([
    paymentMeta && paymentMeta.customerName,
    matchedOrder && matchedOrder.customerName,
    paymentData && paymentData.customer && paymentData.customer.name,
    matchedOrder && matchedOrder.customerEmail ? String(matchedOrder.customerEmail).split('@')[0] : ''
  ]);

  if (!recipientEmail) {
    console.error('❌ Order confirmation email skipped: missing customer email', {
      tx_ref: txRef || null,
      transactionId: paymentData && paymentData.id ? paymentData.id : null,
      paymentMeta,
      paymentDataCustomer: paymentData && paymentData.customer,
      matchedOrderEmail: matchedOrder && matchedOrder.customerEmail
    });
    return;
  }
  console.log('✓ Recipient email resolved:', recipientEmail);

  const buyerEmail = resolveBuyerEmail(
    recipientEmail,
    paymentMeta && paymentMeta.customerEmail,
    paymentData && paymentData.customer && paymentData.customer.email,
    matchedOrder && matchedOrder.customerEmail
  );

  if (!buyerEmail) {
    console.error('❌ Order confirmation email skipped: missing buyer email after resolution', {
      tx_ref: txRef || null,
      transactionId: paymentData && paymentData.id ? paymentData.id : null,
      recipientEmail,
      paymentMetaEmail: paymentMeta && paymentMeta.customerEmail,
      paymentDataCustomerEmail: paymentData && paymentData.customer && paymentData.customer.email,
      matchedOrderEmail: matchedOrder && matchedOrder.customerEmail
    });
    if (txRef) {
      confirmationEmailSentTxRefs.delete(txRef);
    }
    return;
  }
  console.log('✓ Buyer email confirmed:', buyerEmail);

  const paidAmountValue = parseMoneyValue(paymentData && paymentData.amount);
  const preorderTotalValue = parseMoneyValue(paymentMeta && paymentMeta.preorderTotal);
  const remainingBalanceValue = parseMoneyValue(paymentMeta && paymentMeta.remainingBalance);
  const paidAmountHtml = paidAmountValue !== null ? formatEmailCurrency(paidAmountValue, currencyCode) : 'N/A';
  const preorderTotalHtml = preorderTotalValue !== null ? formatEmailCurrency(preorderTotalValue, currencyCode) : 'N/A';
  const remainingBalanceHtml = remainingBalanceValue !== null ? formatEmailCurrency(remainingBalanceValue, currencyCode) : 'N/A';
  const orderIdHtml = matchedOrder && matchedOrder.orderCode
    ? escapeHtml(String(matchedOrder.orderCode))
    : (txRef ? escapeHtml(txRef) : 'N/A');
  const referenceHtml = txRef ? escapeHtml(txRef) : 'N/A';
  const transactionIdHtml = paymentData && paymentData.id ? escapeHtml(String(paymentData.id)) : 'N/A';
  const paymentDate = paymentData && paymentData.created_at ? new Date(paymentData.created_at) : null;
  const paymentDateHtml = paymentDate && !Number.isNaN(paymentDate.getTime())
    ? escapeHtml(paymentDate.toLocaleDateString())
    : 'N/A';

  const mailOptions = {
    from: EMAIL_FROM,
    to: buyerEmail,
    subject: isPreorderDeposit ? 'NORDLUXE - Preorder Deposit Confirmation' : 'NORDLUXE - Order Confirmation',
    html: renderEmailLayout({
      title: isPreorderDeposit ? 'Your Preorder Deposit Has Been Received' : 'Thank You For Your Purchase',
      subtitle: isPreorderDeposit ? 'Deposit Confirmation' : 'Order Confirmation',
      preheader: isPreorderDeposit ? 'Your NORDLUXE preorder deposit has been confirmed.' : 'Your NORDLUXE order has been confirmed.',
      contentHtml: `
        <p style="margin:0 0 14px;line-height:1.7;">Dear ${escapeHtml(customerDisplayName)},</p>
        <p style="margin:-4px 0 14px;"><span style="display:inline-block;background:#f2e8d8;border:1px solid #d4b87e;border-radius:20px;padding:3px 12px;font-size:11px;color:#6e4b1e;letter-spacing:0.5px;font-weight:700;">Order ${orderIdHtml}</span></p>
        <p style="margin:0 0 14px;line-height:1.7;">${isPreorderDeposit ? 'Your 40% preorder deposit has been successfully processed. Here are your order details:' : 'Your order has been successfully processed. Here are your order details:'}</p>

        <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 10px;color:#6e4b1e;">Payment Summary</h3>
          <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${orderIdHtml}</p>
          <p style="margin:0 0 6px;"><strong>Reference:</strong> ${referenceHtml}</p>
          <p style="margin:0 0 6px;"><strong>Amount Paid:</strong> ${paidAmountHtml}</p>
          ${isPreorderDeposit ? `<p style="margin:0 0 6px;"><strong>Full Preorder Total:</strong> ${preorderTotalHtml}</p>` : ''}
          ${isPreorderDeposit ? `<p style="margin:0 0 6px;"><strong>Remaining Balance:</strong> ${remainingBalanceHtml}</p>` : ''}
          <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${escapeHtml(paymentData.payment_type || 'N/A')}</p>
          <p style="margin:0;"><strong>Date:</strong> ${paymentDateHtml}</p>
          <p style="margin:10px 0 0;font-size:11px;color:#a08060;border-top:1px solid #e8dcc7;padding-top:8px;">Transaction ID: ${transactionIdHtml}</p>
        </div>

        <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 10px;color:#6e4b1e;">Items Ordered</h3>
          ${orderedItemsHtml}
        </div>

        <p style="margin:0;line-height:1.7;">${isPreorderDeposit ? 'We will contact you when your piece is ready so you can complete the remaining 60% payment before delivery.' : 'You will receive a shipping confirmation email once your order ships.'}</p>
      `
    })
  };

  try {
    console.log('📧 Attempting to send order confirmation email:', {
      to: buyerEmail,
      tx_ref: txRef,
      transactionId: paymentData && paymentData.id ? paymentData.id : null,
      subject: mailOptions && mailOptions.subject
    });
    const info = await sendBuyerTransactionalEmail(mailOptions);
    console.log('✅ Order confirmation email sent successfully', {
      to: buyerEmail,
      tx_ref: txRef || null,
      transactionId: paymentData && paymentData.id ? paymentData.id : null,
      messageId: info && info.messageId ? info.messageId : null,
      accepted: info && Array.isArray(info.accepted) ? info.accepted : [],
      rejected: info && Array.isArray(info.rejected) ? info.rejected : []
    });
  } catch (error) {
    if (txRef) {
      confirmationEmailSentTxRefs.delete(txRef);
    }
    console.error('❌ Email sending error:', {
      to: buyerEmail,
      tx_ref: txRef || null,
      transactionId: paymentData && paymentData.id ? paymentData.id : null,
      subject: mailOptions && mailOptions.subject,
      error: error && error.message ? error.message : String(error),
      errorStack: error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : 'no stack'
    });
  }
}

// Send payment notification to store owner
async function sendPaymentNotificationEmail(paymentData) {
  if (!getInternalNotificationRecipients().length) {
    console.error('Admin notification email skipped: missing ADMIN_NOTIFICATION_EMAILS or ADMIN_EMAIL setting.');
    return;
  }

  const matchedOrder = await findOrderByFlutterwaveRef(paymentData.tx_ref);
  const paymentMeta = paymentData.meta || {};
  const metaOrderItems = Array.isArray(paymentMeta.orderItems) ? paymentMeta.orderItems : [];
  const orderItems = matchedOrder && Array.isArray(matchedOrder.items) && matchedOrder.items.length
    ? matchedOrder.items
    : metaOrderItems;

  const txRef = paymentData && paymentData.tx_ref ? String(paymentData.tx_ref).trim() : '';
  if (!orderItems.length) {
    console.warn('Internal payment notification continuing without item breakdown', {
      tx_ref: txRef || null,
      transactionId: paymentData && paymentData.id ? paymentData.id : null
    });
  }

  if (txRef && internalNotificationSentTxRefs.has(txRef)) {
    console.log('Skipping duplicate internal payment notification', { tx_ref: txRef });
    return;
  }

  if (txRef) {
    internalNotificationSentTxRefs.add(txRef);
  }

  const itemsHtml = orderItems.length
    ? buildOrderItemsTableHtml(orderItems, paymentData && paymentData.currency ? paymentData.currency : 'NGN')
    : '<p style="margin:0;line-height:1.6;color:#7a6a55;"><em>Item details were not included by the gateway response. Please review the order in admin.</em></p>';
  const isPreorderDeposit = paymentMeta.paymentType === 'preorder-deposit';
  const mailOptions = {
    from: EMAIL_FROM,
    subject: isPreorderDeposit ? 'NEW PREORDER DEPOSIT - NORDLUXE Order Received' : 'NEW SALE - NORDLUXE Order Received',
    html: renderEmailLayout({
      title: isPreorderDeposit ? 'New Preorder Deposit Alert' : 'New Sale Alert',
      subtitle: 'Store Team Notification',
      preheader: isPreorderDeposit ? 'A new preorder deposit has been received.' : 'A new order payment has been received.',
      contentHtml: `
        <p style="margin:0 0 14px;line-height:1.7;">${isPreorderDeposit ? 'You have received a new preorder deposit:' : 'You have received a new order:'}</p>

        <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 10px;color:#6e4b1e;">Customer Details</h3>
          <p style="margin:0 0 6px;"><strong>Name:</strong> ${escapeHtml(paymentData.customer && paymentData.customer.name ? paymentData.customer.name : 'N/A')}</p>
          <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(paymentData.customer && paymentData.customer.email ? paymentData.customer.email : 'N/A')}</p>
          <p style="margin:0;"><strong>Phone:</strong> ${escapeHtml(paymentData.customer && paymentData.customer.phone ? paymentData.customer.phone : 'Not provided')}</p>
        </div>

        <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 10px;color:#6e4b1e;">Payment Details</h3>
          <p style="margin:0 0 6px;"><strong>Transaction ID:</strong> ${escapeHtml(paymentData.id)}</p>
          <p style="margin:0 0 6px;"><strong>Reference:</strong> ${escapeHtml(paymentData.tx_ref)}</p>
          <p style="margin:0 0 6px;"><strong>Amount:</strong> ${escapeHtml(paymentData.currency)} ${escapeHtml(paymentData.amount)}</p>
          ${isPreorderDeposit && paymentMeta.preorderTotal ? `<p style="margin:0 0 6px;"><strong>Full Preorder Total:</strong> ${escapeHtml(paymentData.currency)} ${escapeHtml(paymentMeta.preorderTotal)}</p>` : ''}
          ${isPreorderDeposit && paymentMeta.remainingBalance ? `<p style="margin:0 0 6px;"><strong>Remaining Balance:</strong> ${escapeHtml(paymentData.currency)} ${escapeHtml(paymentMeta.remainingBalance)}</p>` : ''}
          <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${escapeHtml(paymentData.payment_type || 'N/A')}</p>
          <p style="margin:0 0 6px;"><strong>Status:</strong> ${escapeHtml(paymentData.status || 'N/A')}</p>
          <p style="margin:0;"><strong>Date:</strong> ${escapeHtml(new Date(paymentData.created_at).toLocaleString())}</p>
        </div>

        <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 10px;color:#6e4b1e;">Items Ordered</h3>
          ${itemsHtml}
        </div>

        <p style="margin:0;line-height:1.7;">${isPreorderDeposit ? 'Please track production and request the remaining 60% once the piece is ready.' : 'Please process this order promptly.'}</p>
      `
    })
  };

  try {
    await sendInternalTransactionalEmail(mailOptions);
    console.log('Payment notification email sent to internal recipients', {
      recipients: getInternalNotificationRecipients()
    });
  } catch (error) {
    console.error('Admin notification email error:', error);
  }
}

// Auth routes
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login.html' }), (req, res) => {
    res.redirect('/index.html');
  });
} else {
  app.get('/auth/google', (req, res) => {
    res.status(503).send('Google login is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env and restart the server.');
  });

  app.get('/auth/google/callback', (req, res) => {
    res.redirect('/login.html');
  });
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
  app.get('/auth/apple', passport.authenticate('apple'));

  app.get('/auth/apple/callback', passport.authenticate('apple', { failureRedirect: '/login.html' }), (req, res) => {
    res.redirect('/index.html');
  });
}

// Email login
app.post('/auth/email/send-otp', async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({
        success: false,
        message: 'Email service is not configured on server'
      });
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ email, isFirstLogin: true });
    }

    // Existing accounts created via password/social login may not have OTP secret yet.
    if (!user.otpSecret) {
      user.otpSecret = authenticator.generateSecret();
    }

    await user.save();

    const token = authenticator.generate(user.otpSecret);
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Your NORDLUXE Login OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to NORDLUXE</h2>
          <p>Your one-time password is: <strong>${token}</strong></p>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `
    };

    await sendTransactionalEmail(mailOptions);
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('send-otp error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

app.post('/auth/email/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  try {
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: 'User not found' });

    if (!user.otpSecret) {
      return res.status(400).json({ success: false, message: 'No OTP active for this account. Request a new OTP.' });
    }

    const isValid = authenticator.verify({ token: otp, secret: user.otpSecret });
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    if (user.isFirstLogin) {
      user.isFirstLogin = false;
      await user.save();
    }

    req.login(user, (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Login failed' });
      res.json({ success: true, message: 'Logged in successfully' });
    });
  } catch (error) {
    console.error('verify-otp error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/index.html');
  });
});

app.get('/auth/user', (req, res) => {
  if (req.user) {
    res.json({ user: { email: req.user.email, name: req.user.name } });
  } else {
    res.json({ user: null });
  }
});

app.post('/auth/password/reset-request', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ success: false, message: 'Email service is not configured on server' });
  }

  if (!firebaseAdminAuth) {
    return res.status(503).json({ success: false, message: 'Password reset service is not configured on server' });
  }

  const normalizedEmail = normalizeText(email).toLowerCase();
  const frontendBase = normalizeText(process.env.FRONTEND_URL) || `http://localhost:${PORT}`;
  const actionCodeSettings = {
    url: `${frontendBase}/html/login.html`,
    handleCodeInApp: false
  };

  try {
    const userRecord = await firebaseAdminAuth.getUserByEmail(normalizedEmail);
    const hasPasswordProvider = (userRecord.providerData || []).some((provider) => provider.providerId === 'password');

    if (hasPasswordProvider) {
      const resetLink = await firebaseAdminAuth.generatePasswordResetLink(normalizedEmail, actionCodeSettings);

      await sendTransactionalEmail({
        from: EMAIL_FROM,
        to: normalizedEmail,
        subject: 'NORDLUXE - Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d19b48;">Reset Your NORDLUXE Password</h2>
            <p>We received a request to reset your password.</p>
            <p style="margin: 20px 0;">
              <a href="${resetLink}" style="background: #d19b48; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 8px; display: inline-block;">Reset Password</a>
            </p>
            <p>If you did not request this, you can safely ignore this email.</p>
            <p style="color: #666; font-size: 12px;">For security reasons, this link expires automatically.</p>
          </div>
        `
      });
    }

    return res.json({
      success: true,
      message: 'If an Email/Password account exists for this email, a reset link has been sent.'
    });
  } catch (error) {
    if (error && error.code !== 'auth/user-not-found') {
      console.error('password reset request error:', error);
    }

    return res.json({
      success: true,
      message: 'If an Email/Password account exists for this email, a reset link has been sent.'
    });
  }
});

// Password-based auth routes
app.post('/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, name });
    await user.save();

    req.login(user, (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Signup failed' });
      res.json({ success: true, message: 'Account created successfully' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

app.post('/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.password) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    req.login(user, (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Login failed' });
      res.json({ success: true, message: 'Logged in successfully' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Public configuration endpoint
app.get(['/api/config', '/config'], (req, res) => {
  const publicKey = (
    process.env.FLUTTERWAVE_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ||
    process.env.PUBLIC_KEY_FLUTTERWAVE ||
    ''
  ).trim();
  res.json({
    success: true,
    flutterwavePublicKey: publicKey
  });
});

// Health check
app.get('/api/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const heapUsedMb = Number((memoryUsage.heapUsed / 1024 / 1024).toFixed(1));
  const heapTotalMb = Number((memoryUsage.heapTotal / 1024 / 1024).toFixed(1));

  res.json({
    status: 'ok',
    environment: NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    shuttingDown: isShuttingDown,
    storage: {
      mongoReady,
      mode: mongoReady ? 'mongodb' : 'fallback-file'
    },
    memory: {
      heapUsedMb,
      heapTotalMb
    }
  });
});

app.get('/api/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ ready: false, reason: 'shutting_down' });
  }

  return res.json({
    ready: true,
    mode: mongoReady ? 'mongodb' : 'fallback-file',
    timestamp: new Date().toISOString()
  });
});

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function parseDevice(ua) {
  if (!ua) return 'Unknown';
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) return 'Mobile';
  if (/tablet/i.test(ua)) return 'Tablet';
  return 'Desktop';
}

// Public heartbeat used by storefront pages for live visitor analytics
app.post('/api/analytics/heartbeat', (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = normalizeText(body.sessionId || body.sid || '');
    const page = normalizePagePath(body.page || req.headers.referer || '/');
    const pageTitle = normalizeText(body.title || '').slice(0, 120);
    const userEmail = normalizeText(body.userEmail || '').toLowerCase().slice(0, 160);
    const userName = normalizeText(body.userName || '').slice(0, 120);
    const isLoggedIn = Boolean(body.isLoggedIn || userEmail);

    if (!sessionId || sessionId.length < 8 || sessionId.length > 120) {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const existing = liveSessions.get(sessionId) || {};
    const wasLoggedIn = Boolean(existing.isLoggedIn);
    const firstSeenAt = existing.firstSeenAt || Date.now();
    const pageHistory = Array.isArray(existing.pageHistory) ? existing.pageHistory : [];
    const lastPage = pageHistory.length > 0 ? pageHistory[pageHistory.length - 1] : null;
    if (!lastPage || lastPage.page !== page) {
      pageHistory.push({ page, title: pageTitle, at: Date.now() });
      if (pageHistory.length > 30) pageHistory.shift();
    }

    liveSessions.set(sessionId, {
      page,
      pageTitle,
      firstSeenAt,
      lastSeenAt: Date.now(),
      pageHistory,
      isLoggedIn,
      userEmail,
      userName,
      userAgent: normalizeText(req.headers['user-agent'] || '').slice(0, 220)
    });

    if (!wasLoggedIn && isLoggedIn) {
      pushLiveEvent({
        at: Date.now(),
        type: 'auth-login',
        sessionId: sessionId.slice(0, 8) + '...',
        page,
        title: pageTitle,
        userEmail,
        userName
      });
    }

    cleanupLiveSessions();
    return res.json({ success: true });
  } catch (error) {
    console.error('Heartbeat analytics error:', error.message);
    return res.status(500).json({ success: false, message: 'Heartbeat failed' });
  }
});

// Public explicit session-end signal to immediately remove a visitor
app.post('/api/analytics/session-end', (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = normalizeText(body.sessionId || body.sid || '');
    const reason = normalizeText(body.reason || 'ended').slice(0, 60);

    if (!sessionId || sessionId.length < 8 || sessionId.length > 120) {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const existing = liveSessions.get(sessionId);
    if (existing) {
      pushLiveEvent({
        at: Date.now(),
        type: reason === 'logout' ? 'auth-logout' : 'session-end',
        sessionId: sessionId.slice(0, 8) + '...',
        page: existing.page || '/',
        title: existing.pageTitle || '',
        userEmail: existing.userEmail || '',
        userName: existing.userName || ''
      });
    }

    liveSessions.delete(sessionId);
    cleanupLiveSessions();
    return res.json({ success: true, activeVisitors: liveSessions.size });
  } catch (error) {
    console.error('Session end analytics error:', error.message);
    return res.status(500).json({ success: false, message: 'Session end failed' });
  }
});

// Public activity event endpoint (site actions: page/search/cart/etc.)
app.post('/api/analytics/event', (req, res) => {
  try {
    const body = req.body || {};
    const sessionId = normalizeText(body.sessionId || body.sid || '');
    const type = normalizeText(body.type || '').slice(0, 50);
    const title = normalizeText(body.title || '').slice(0, 160);
    const details = normalizeText(body.details || '').slice(0, 220);
    const page = normalizePagePath(body.page || '/');
    const userEmail = normalizeText(body.userEmail || '').toLowerCase().slice(0, 160);
    const userName = normalizeText(body.userName || '').slice(0, 120);

    if (!sessionId || sessionId.length < 8 || sessionId.length > 120 || !type) {
      return res.status(400).json({ success: false, message: 'Invalid event payload' });
    }

    pushLiveEvent({
      at: Date.now(),
      type,
      title,
      details,
      page,
      userEmail,
      userName,
      sessionId: sessionId.slice(0, 8) + '...'
    });

    return res.json({ success: true });
        if (txRef) {
          internalNotificationSentTxRefs.delete(txRef);
        }
  } catch (error) {
    console.error('Analytics event error:', error.message);
    return res.status(500).json({ success: false, message: 'Event capture failed' });
  }
});

// Admin-only live sessions (full detail per visitor)
app.get('/api/admin/live-sessions', (req, res) => {
  try {
    if (req.headers['x-admin-key'] !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    cleanupLiveSessions();
    const sessions = [];
    for (const [sessionId, entry] of liveSessions.entries()) {
      const timeOnSiteMs = Date.now() - Number(entry.firstSeenAt || Date.now());
      sessions.push({
        sessionId: sessionId.slice(0, 8) + '...',
        currentPage: entry.page || '/',
        pageTitle: entry.pageTitle || '',
        isLoggedIn: Boolean(entry.isLoggedIn),
        userEmail: entry.userEmail || '',
        userName: entry.userName || '',
        timeOnSite: formatDuration(timeOnSiteMs),
        timeOnSiteMs,
        pagesVisited: Array.isArray(entry.pageHistory) ? entry.pageHistory.length : 1,
        pageHistory: entry.pageHistory || [],
        device: parseDevice(entry.userAgent || ''),
        lastSeenAt: entry.lastSeenAt
      });
    }
    sessions.sort((a, b) => b.timeOnSiteMs - a.timeOnSiteMs);
    return res.json({ success: true, sessions, total: sessions.length, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Admin live-sessions error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch sessions' });
  }
});

// Admin customer summary (unique customers from orders)
app.get('/api/admin/customer-summary', async (req, res) => {
  try {
    if (req.headers['x-admin-key'] !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const orders = await getOrdersForQuery({});
    const map = {};
    for (const order of orders) {
      const email = normalizeText(order.customerEmail || '').toLowerCase();
      if (!email) continue;
      if (!map[email]) {
        map[email] = { email, name: order.customerName || 'Unknown', orderCount: 0, totalSpend: 0, lastOrderAt: null, orders: [] };
      }
      map[email].orderCount++;
      map[email].totalSpend += Number(order.totalAmount || 0);
      const d = new Date(order.createdAt);
      if (!map[email].lastOrderAt || d > new Date(map[email].lastOrderAt)) {
        map[email].lastOrderAt = order.createdAt;
      }
      map[email].orders.push({ id: displayOrderId(order), status: order.status || 'pending', amount: order.totalAmount || 0, date: order.createdAt });
    }
    const customers = Object.values(map).sort((a, b) => b.totalSpend - a.totalSpend);
    return res.json({ success: true, customers, total: customers.length });
  } catch (error) {
    console.error('Admin customer-summary error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch customers' });
  }
});

// Admin-only live analytics snapshot
app.get('/api/admin/live-analytics', (req, res) => {
  try {
    if (req.headers['x-admin-key'] !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const snapshot = buildLiveAnalyticsSnapshot();
    return res.json({ success: true, ...snapshot });
  } catch (error) {
    console.error('Admin live analytics error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch analytics' });
  }
});

// Admin-only recent site activity feed
app.get('/api/admin/live-events', (req, res) => {
  try {
    if (req.headers['x-admin-key'] !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 120)));
    return res.json({
      success: true,
      events: liveEvents.slice(0, limit),
      total: liveEvents.length,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin live-events error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not fetch events' });
  }
});

// ─── Newsletter Routes ─────────────────────────────────────────────────────

// Subscribe to newsletter
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const rawName = req.body.name;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }

    const email = rawEmail.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    const name = normalizeText(rawName).slice(0, 80);

    const existing = await Subscriber.findOne({ email });
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await existing.save();
        return res.json({ success: true, message: 'Welcome back! You have been re-subscribed.' });
      }
      return res.json({ success: true, message: 'You are already subscribed.' });
    }

    await Subscriber.create({ email, name });

    // Welcome email to subscriber
    await sendTransactionalEmail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome to NORDLUXE — You\'re on the list',
      html: `
        <div style="font-family: Montserrat, sans-serif; max-width: 560px; margin: 0 auto; background: #fffaf2; border: 1px solid rgba(209,155,72,0.3); border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #1a1208, #2c1e08); padding: 28px 32px; text-align: center;">
            <h1 style="color: #d19b48; font-size: 22px; letter-spacing: 4px; margin: 0;">NORDLUXE</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #2c2016; font-size: 18px; margin-bottom: 14px;">Welcome${name ? ', ' + escapeHtml(name) : ''}</h2>
            <p style="color: #5a4429; font-size: 15px; line-height: 1.7; margin-bottom: 16px;">You're now part of an exclusive circle. Expect early access to new collections, behind-the-scenes stories, and preorder windows before they open to the public.</p>
            <p style="color: #5a4429; font-size: 14px; line-height: 1.7;">We don't flood your inbox. When we reach out, it's worth reading.</p>
            <div style="margin: 24px 0; text-align: center;">
              <a href="https://nordluxe.com" style="background: #d19b48; color: #fff; padding: 12px 28px; border-radius: 22px; text-decoration: none; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">Explore the Collection</a>
            </div>
            <hr style="border: none; border-top: 1px solid rgba(209,155,72,0.2); margin: 24px 0;">
            <p style="color: #9a7d56; font-size: 12px;">You received this because you subscribed at nordluxe.com. <a href="https://nordluxe.com/html/unsubscribe.html?email=${encodeURIComponent(email)}" style="color: #d19b48;">Unsubscribe</a> at any time.</p>
          </div>
        </div>
      `
    });

    res.json({ success: true, message: 'You\'re subscribed! Check your inbox for a welcome email.' });
  } catch (err) {
    console.error('Newsletter subscribe error:', err);
    res.status(500).json({ success: false, message: 'Could not subscribe. Please try again.' });
  }
});

// Unsubscribe from newsletter
app.post('/api/newsletter/unsubscribe', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ success: false, message: 'Email required.' });
    }
    const email = rawEmail.toLowerCase().trim();
    await Subscriber.updateOne({ email }, { active: false });
    res.json({ success: true, message: 'You have been unsubscribed.' });
  } catch (err) {
    console.error('Newsletter unsubscribe error:', err);
    res.status(500).json({ success: false, message: 'Could not unsubscribe. Please try again.' });
  }
});

// Send newsletter — admin only (protect with NEWSLETTER_ADMIN_KEY in .env)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const { subject, html, text } = req.body;
    if (!subject || !html) {
      return res.status(400).json({ success: false, message: 'subject and html are required.' });
    }

    const subscribers = await Subscriber.find({ active: true }).select('email name').lean();
    if (!subscribers.length) {
      return res.json({ success: true, message: 'No active subscribers found.', sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      try {
        const personalizedHtml = html
          .replace(/{{name}}/g, escapeHtml(sub.name || 'there'))
          .replace(/{{email}}/g, encodeURIComponent(sub.email));

        await sendTransactionalEmail({
          from: EMAIL_FROM,
          to: sub.email,
          subject: subject,
          html: personalizedHtml,
          text: text || ''
        });
        sent++;
      } catch (mailErr) {
        console.error('Failed to send to', sub.email, mailErr);
        failed++;
      }
    }

    res.json({
      success: true,
      message: `Newsletter sent to ${sent} subscriber(s). ${failed} failed.`,
      sent,
      failed
    });
  } catch (err) {
    console.error('Newsletter send error:', err);
    res.status(500).json({ success: false, message: 'Could not send newsletter.' });
  }
});

// ─── End Newsletter Routes ───────────────────────────────────────────────────

// ─── Order Tracking Routes ───────────────────────────────────────────────────

// Helper: Send status update email
async function sendStatusUpdateEmail(order, newStatus) {
  const statusMessages = {
    confirmed: 'Thank you for your order. Your order is now being made by our team.',
    packed: 'Your order is being prepared and packed for shipping.',
    dispatched: 'Your order has been shipped and is now on the way to you.',
    'in-transit': 'Your order is coming to you and is currently in transit.',
    delivered: 'Your order has arrived at your delivery location.',
    received: 'Your order is here and marked as completed. Thank you for shopping with NORDLUXE.'
  };

  const recipient = normalizeText(order && order.customerEmail).toLowerCase();
  if (!recipient) {
    console.error('Status email send error: Missing customer email for order', displayOrderId(order));
    return false;
  }

  const trackingInfo = order.trackingNumber ? `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p><p><strong>Shipping Company:</strong> ${order.shippingCompany || 'Standard Shipping'}</p>` : '';

  const mailOptions = {
    from: EMAIL_FROM,
    to: recipient,
    subject: `NORDLUXE Update: Order ${displayOrderId(order)} - ${newStatus.toUpperCase()}`,
    html: `
      <h2>Order Status Update</h2>
      <p>Hi ${order.customerName},</p>
      <p>${statusMessages[newStatus]}</p>
      ${trackingInfo}
      <div style="background: #f8f8f8; border-radius: 10px; padding: 16px; margin: 16px 0;">
        <h3>Order Summary</h3>
        <p><strong>Order ID:</strong> ${displayOrderId(order)}</p>
        <p><strong>Status:</strong> ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1).replace(/-/g, ' ')}</p>
        <p><strong>Total Amount:</strong> ₦${order.totalAmount.toLocaleString()}</p>
        ${order.statusHistory.length ? `<p><strong>Order Created:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>` : ''}
      </div>
      <p>If you need any assistance, please contact our support team.</p>
      <p>Best regards,<br/>NORDLUXE Team</p>
    `
  };

  try {
    await sendTransactionalEmail(mailOptions);
    return true;
  } catch (err) {
    console.error('Status email send error:', err);
    return false;
  }
}

// POST /api/orders - Create order (called after successful payment)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerEmail, customerName, userId, items, totalAmount, paymentPlan, flutterwaveRef, paymentReference } = req.body;
    const normalizedCustomerEmail = extractSingleEmail(customerEmail);
    const normalizedCustomerName = normalizeText(customerName);

    if (!normalizedCustomerEmail || !normalizedCustomerName || !items || !totalAmount) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let orderCode = generateOrderCode();
    for (let i = 0; i < 5; i++) {
      let exists = null;
      if (mongoReady) {
        exists = await Order.findOne({ orderCode });
      } else {
        exists = readFallbackOrders().find((x) => String(x.orderCode || '').toUpperCase() === orderCode);
      }
      if (!exists) break;
      orderCode = generateOrderCode();
    }

    const orderPayload = {
      customerEmail: normalizedCustomerEmail,
      customerName: normalizedCustomerName,
      orderCode,
      userId: userId || null,
      items,
      totalAmount,
      paymentPlan: paymentPlan || {},
      flutterwaveRef: flutterwaveRef || null,
      paymentReference: paymentReference || null,
      status: 'pending',
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(),
        notes: 'Order created'
      }],
      createdAt: new Date(),
      assignedTo: '',
      internalNotes: [],
      customerConfirmedReceived: false,
      notificationsSent: {
        confirmed: false,
        packed: false,
        dispatched: false,
        inTransit: false,
        delivered: false,
        received: false
      }
    };

    let order;
    if (mongoReady) {
      const doc = new Order(orderPayload);
      await doc.save();
      order = doc.toObject();
    } else {
      const all = readFallbackOrders();
      order = Object.assign({ _id: crypto.randomBytes(12).toString('hex') }, orderPayload);
      all.unshift(order);
      writeFallbackOrders(all);
    }

    // Send confirmation email directly using the real customer email from the request body
    try {
      const currencyCode = 'NGN';
      const itemsHtml = Array.isArray(items) && items.length
        ? buildOrderItemsTableHtml(items, currencyCode)
        : '<p style="margin:0;line-height:1.6;color:#7a6a55;"><em>Item details are being finalized. Your payment has been received successfully.</em></p>';
      const amountValue = parseMoneyValue(totalAmount);
      const amountHtml = amountValue !== null ? formatEmailCurrency(amountValue, currencyCode) : escapeHtml(String(totalAmount));
      const isPreorderDeposit = paymentPlan && paymentPlan.type === 'preorder-deposit';

      await sendBuyerTransactionalEmail({
        from: EMAIL_FROM,
        to: normalizedCustomerEmail,
        subject: isPreorderDeposit ? 'NORDLUXE - Preorder Deposit Confirmation' : 'NORDLUXE - Order Confirmation',
        html: renderEmailLayout({
          title: isPreorderDeposit ? 'Your Preorder Deposit Has Been Received' : 'Thank You For Your Purchase',
          subtitle: isPreorderDeposit ? 'Deposit Confirmation' : 'Order Confirmation',
          preheader: isPreorderDeposit ? 'Your NORDLUXE preorder deposit has been confirmed.' : 'Your NORDLUXE order has been confirmed.',
          contentHtml: `
            <p style="margin:0 0 14px;line-height:1.7;">Dear ${escapeHtml(normalizedCustomerName)},</p>
            <p style="margin:-4px 0 14px;"><span style="display:inline-block;background:#f2e8d8;border:1px solid #d4b87e;border-radius:20px;padding:3px 12px;font-size:11px;color:#6e4b1e;letter-spacing:0.5px;font-weight:700;">Order ${escapeHtml(orderCode)}</span></p>
            <p style="margin:0 0 14px;line-height:1.7;">${isPreorderDeposit ? 'Your 40% preorder deposit has been successfully processed. Here are your order details:' : 'Your order has been successfully processed. Here are your order details:'}</p>
            <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
              <h3 style="margin:0 0 10px;color:#6e4b1e;">Payment Summary</h3>
              <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${escapeHtml(orderCode)}</p>
              <p style="margin:0 0 6px;"><strong>Amount Paid:</strong> ${amountHtml}</p>
              <p style="margin:0;"><strong>Status:</strong> Confirmed</p>
            </div>
            <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
              <h3 style="margin:0 0 10px;color:#6e4b1e;">Items Ordered</h3>
              ${itemsHtml}
            </div>
            <p style="margin:0;line-height:1.7;">${isPreorderDeposit ? 'We will contact you when your piece is ready so you can complete the remaining 60% payment before delivery.' : 'You will receive a shipping confirmation email once your order ships.'}</p>
          `
        })
      });
      console.log('✅ Order confirmation email sent to:', normalizedCustomerEmail);
    } catch (emailErr) {
      console.error('❌ Failed to send order confirmation email:', emailErr.message);
    }

    // Send internal notification to admin
    try {
      const amountValue2 = parseMoneyValue(totalAmount);
      const amountHtml2 = amountValue2 !== null ? formatEmailCurrency(amountValue2, 'NGN') : escapeHtml(String(totalAmount));
      await sendInternalTransactionalEmail({
        from: EMAIL_FROM,
        subject: `New Order: ${orderCode} from ${normalizedCustomerName}`,
        html: renderEmailLayout({
          title: 'New Order Received',
          subtitle: 'Admin Notification',
          preheader: `New order ${orderCode} placed by ${normalizedCustomerName}`,
          contentHtml: `
            <p style="margin:0 0 10px;"><strong>Order ID:</strong> ${escapeHtml(orderCode)}</p>
            <p style="margin:0 0 10px;"><strong>Customer:</strong> ${escapeHtml(normalizedCustomerName)} (${escapeHtml(normalizedCustomerEmail)})</p>
            <p style="margin:0 0 10px;"><strong>Total:</strong> ${amountHtml2}</p>
            ${Array.isArray(items) && items.length ? buildOrderItemsTableHtml(items, 'NGN') : '<p>No item details.</p>'}
          `
        })
      });
      console.log('✅ Admin notification email sent');
    } catch (adminEmailErr) {
      console.error('❌ Failed to send admin notification email:', adminEmailErr.message);
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ success: false, message: 'Could not create order' });
  }
});

// GET /api/orders - Get all orders (admin only)
app.get('/api/orders', async (req, res) => {
  try {
    if (req.headers['x-admin-key'] !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const orders = await getOrdersForQuery({});
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch orders' });
  }
});

async function findOrderByFlexibleId(orderId) {
  if (!orderId) return null;

  const raw = decodeURIComponent(String(orderId)).trim().replace(/^#/, '');
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, '').replace(/[^A-Za-z0-9-]/g, '');
  const upper = normalized.toUpperCase();
  if (!upper) return null;

  if (mongoReady) {
    const byPaymentRef = await Order.findOne({
      $or: [
        { paymentReference: normalized },
        { paymentReference: upper },
        { flutterwaveRef: normalized },
        { flutterwaveRef: upper }
      ]
    });
    if (byPaymentRef) return byPaymentRef;
  } else {
    const fallbackAll = readFallbackOrders();
    const byPaymentRef = fallbackAll.find((x) => {
      const pref = String(x.paymentReference || '');
      const fref = String(x.flutterwaveRef || '');
      return pref === normalized || pref.toUpperCase() === upper || fref === normalized || fref.toUpperCase() === upper;
    });
    if (byPaymentRef) return byPaymentRef;
  }

  if (/^NLX-[A-Z0-9]{8}$/.test(upper)) {
    const byExactCode = mongoReady
      ? await Order.findOne({ orderCode: upper })
      : readFallbackOrders().find((x) => String(x.orderCode || '').toUpperCase() === upper);
    if (byExactCode) return byExactCode;
  }

  if (/^[A-Z0-9]{8}$/.test(upper)) {
    const byShortCode = mongoReady
      ? await Order.findOne({ orderCode: `NLX-${upper}` })
      : readFallbackOrders().find((x) => String(x.orderCode || '').toUpperCase() === `NLX-${upper}`);
    if (byShortCode) return byShortCode;
  }

  const codeCandidate = upper.startsWith('NLX-') ? upper : `NLX-${upper}`;
  const byOrderCode = mongoReady
    ? await Order.findOne({ orderCode: codeCandidate })
    : readFallbackOrders().find((x) => String(x.orderCode || '').toUpperCase() === codeCandidate);
  if (byOrderCode) return byOrderCode;

  if (/^NLX-[A-Z0-9]{8}$/.test(upper)) {
    const bareShort = upper.replace(/^NLX-/, '');
    const recentOrders = mongoReady
      ? await Order.find().sort({ createdAt: -1 }).limit(5000)
      : sortByCreatedDesc(readFallbackOrders()).slice(0, 5000);
    const byLegacyShort = recentOrders.find((item) => item._id.toString().slice(-8).toUpperCase() === bareShort);
    if (byLegacyShort) return byLegacyShort;
  }

  if (/^[a-fA-F0-9]{24}$/.test(normalized)) {
    if (mongoReady) {
      return Order.findById(normalized);
    }
    const byRawId = readFallbackOrders().find((x) => String(x._id || '') === normalized);
    if (byRawId) return byRawId;
  }

  const recentOrders = mongoReady
    ? await Order.find().sort({ createdAt: -1 }).limit(5000)
    : sortByCreatedDesc(readFallbackOrders()).slice(0, 5000);
  return recentOrders.find((item) => item._id.toString().slice(-8).toUpperCase() === upper) || null;
}

// GET /api/orders/:orderId - Get order details
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const order = await findOrderByFlexibleId(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch order' });
  }
});

// GET /api/users/:userId/orders - Get all orders for a user
app.get('/api/users/:userId/orders', async (req, res) => {
  try {
    let query = {};
    
    // Support both userId path parameter and email query parameter
    if (req.params.userId === 'guest' && req.query.email) {
      const email = String(req.query.email || '').trim();
      query = { customerEmail: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    } else {
      query = { 
        $or: [
          { userId: req.params.userId },
          { customerEmail: new RegExp(`^${String(req.query.email || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        ]
      };
    }
    
    const orders = await getOrdersForQuery(query);
    
    res.json({ success: true, orders });
  } catch (err) {
    console.error('User orders fetch error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch orders' });
  }
});

// PUT /api/orders/:orderId/status - Update order status (admin only)
app.put('/api/orders/:orderId/status', async (req, res) => {
  try {
    const { status, trackingNumber, trackingUrl, shippingCompany, notes, updatedBy, internalNote } = req.body;

    // Verify admin key
    if (req.headers['x-admin-key'] !== process.env.NEWSLETTER_ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const validStatuses = ['pending', 'confirmed', 'packed', 'dispatched', 'in-transit', 'delivered', 'received'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    let order = await findOrderByFlexibleId(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Update status
    order.status = status;
    const actor = normalizeText(updatedBy);
    const customerNotes = normalizeText(notes);
    const notePrefix = actor ? `Updated by ${actor}` : '';
    const historyNotes = [customerNotes, notePrefix].filter(Boolean).join(' | ');

    order.statusHistory.push({
      status: status,
      timestamp: new Date(),
      notes: historyNotes || customerNotes || ''
    });

    if (actor) {
      order.assignedTo = actor;
    }

    const safeInternalNote = normalizeText(internalNote);
    if (safeInternalNote) {
      if (!Array.isArray(order.internalNotes)) order.internalNotes = [];
      order.internalNotes.push({
        note: safeInternalNote,
        by: actor || 'Admin',
        at: new Date()
      });
    }

    // Update timestamp fields based on status
    if (status === 'confirmed' && !order.confirmedAt) order.confirmedAt = new Date();
    if (status === 'packed' && !order.packedAt) order.packedAt = new Date();
    if (status === 'dispatched' && !order.dispatchedAt) order.dispatchedAt = new Date();
    if (status === 'in-transit') {
      order.trackingNumber = trackingNumber || order.trackingNumber;
      order.trackingUrl = trackingUrl || order.trackingUrl;
      order.shippingCompany = shippingCompany || order.shippingCompany;
    }
    if (status === 'delivered' && !order.deliveredAt) order.deliveredAt = new Date();

    if (mongoReady && typeof order.save === 'function') {
      await order.save();
    } else {
      const list = readFallbackOrders();
      const idx = list.findIndex((x) => String(x._id) === String(order._id));
      if (idx >= 0) {
        list[idx] = order;
        writeFallbackOrders(list);
      }
    }

    // Send status update email
    const notificationKeyByStatus = {
      confirmed: 'confirmed',
      packed: 'packed',
      dispatched: 'dispatched',
      'in-transit': 'inTransit',
      delivered: 'delivered',
      received: 'received'
    };
    const notificationKey = notificationKeyByStatus[status];

    if (!order.notificationsSent || typeof order.notificationsSent !== 'object') {
      order.notificationsSent = {
        confirmed: false,
        packed: false,
        dispatched: false,
        inTransit: false,
        delivered: false,
        received: false
      };
    }

    let emailSent = true;
    if (notificationKey && !order.notificationsSent[notificationKey]) {
      emailSent = await sendStatusUpdateEmail(order, status);
      if (emailSent) {
        order.notificationsSent[notificationKey] = true;
        if (mongoReady && typeof order.save === 'function') {
          await order.save();
        } else {
          const list = readFallbackOrders();
          const idx = list.findIndex((x) => String(x._id) === String(order._id));
          if (idx >= 0) {
            list[idx] = order;
            writeFallbackOrders(list);
          }
        }
      }
    }

    res.json({
      success: true,
      order,
      message: emailSent
        ? `Order status updated to ${status}`
        : `Order status updated to ${status}, but email delivery failed`
    });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ success: false, message: 'Could not update order status' });
  }
});

// ─── End Order Tracking Routes ───────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      message: `Request payload too large. Maximum allowed is ${REQUEST_BODY_LIMIT}.`
    });
  }

  console.error('Unhandled backend error:', err && err.stack ? err.stack : err);
  return res.status(500).json({ success: false, message: 'Internal server error' });
});

function closeMongoConnection() {
  if (!mongoose.connection || mongoose.connection.readyState === 0) {
    return Promise.resolve();
  }

  return mongoose.connection.close(false)
    .then(() => {
      console.log('MongoDB connection closed');
    })
    .catch((error) => {
      console.error('Error closing MongoDB connection:', error && error.message ? error.message : error);
    });
}

function shutdown(signal, exitCode) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.warn(`${signal} received. Starting graceful shutdown.`);

  const hardStopTimer = setTimeout(() => {
    console.error(`Forced shutdown after ${SHUTDOWN_TIMEOUT_MS}ms`);
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS);

  hardStopTimer.unref();

  if (!server) {
    closeMongoConnection().finally(() => process.exit(exitCode));
    return;
  }

  server.close(() => {
    closeMongoConnection().finally(() => process.exit(exitCode));
  });
}

// Start server
server = app.listen(PORT, () => {
  console.log(`NORDLUXE backend server running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/api/webhook`);
});

server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
server.headersTimeout = Math.max(HEADERS_TIMEOUT_MS, KEEP_ALIVE_TIMEOUT_MS + 1000);

process.on('SIGINT', () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error && error.stack ? error.stack : error);
  shutdown('uncaughtException', 1);
});

// Test endpoint for debugging email delivery (development only)
app.post('/api/test-email', async (req, res) => {
  const { to, subject, type } = req.body;
  
  if (!to || !to.includes('@')) {
    return res.status(400).json({ error: 'Valid email address required' });
  }

  try {
    console.log('Test email endpoint called:', { to, subject, type });
    
    if (type === 'order-confirmation') {
      const testPaymentData = {
        id: 'test_' + Date.now(),
        tx_ref: 'TEST_' + Date.now(),
        amount: 50000,
        currency: 'NGN',
        status: 'successful',
        customer: {
          email: to,
          name: 'Test Customer'
        },
        meta: {
          customerEmail: to,
          paymentType: 'order'
        }
      };
      
      await sendOrderConfirmationEmail(testPaymentData);
      return res.json({ 
        success: true, 
        message: 'Test order confirmation email sent',
        to: to 
      });
    }
    
    if (type === 'generic') {
      const mailOptions = {
        from: `NORDLUXE <${process.env.EMAIL_USER || 'nord.luxe01@gmail.com'}>`,
        to: to,
        subject: subject || 'Test Email from NORDLUXE',
        html: `<p>This is a test email from NORDLUXE.</p><p>If you received this, email delivery is working correctly.</p>`
      };
      
      const info = await sendBuyerTransactionalEmail(mailOptions);
      return res.json({ 
        success: true, 
        message: 'Test generic email sent',
        to: to,
        messageId: info && info.messageId
      });
    }
    
    res.status(400).json({ error: 'Unknown email type. Use: order-confirmation, generic' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ 
      error: 'Failed to send test email',
      details: error && error.message ? error.message : String(error)
    });
  }
});

module.exports = app;