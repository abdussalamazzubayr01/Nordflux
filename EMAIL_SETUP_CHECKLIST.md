# Email Setup Action Checklist - NORDLUXE Production

Quick reference checklist to set up real post-purchase emails for production deployment.

---

## ✅ Quick Checklist (Follow In Order)

### Phase 1: Gmail Setup (15 minutes)
- [ ] Have a Gmail account ready (or create one)
- [ ] Go to myaccount.google.com
- [ ] Enable 2-Step Verification (Security → 2-Step Verification)
- [ ] Go to Security → App passwords
- [ ] Select "Mail" and "Windows" (or your OS)
- [ ] Copy the 16-character app password (example: `abcd efgh ijkl mnop`)

**Your credentials:**
```
Gmail Email: ___________________________
App Password: ___________________________
```

---

### Phase 2: Environment Configuration (5 minutes)

#### LOCAL TESTING (on your Windows machine)
1. Create `.env` file in project root: `c:\Users\USER\OneDrive\Desktop\NORDLUXE\.env`
2. Add these values:
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=abcdefghijklmnop
ADMIN_EMAIL=your-email@gmail.com
ADMIN_NOTIFICATION_EMAILS=your-email@gmail.com
EMAIL_FROM=NORDLUXE <nord.luxe01@gmail.com>
FLUTTERWAVE_SECRET_HASH=get-from-flutterwave-dashboard
```

#### PRODUCTION (Vercel or your host)
1. Log into your hosting dashboard (Vercel, Heroku, Railway, etc.)
2. Go to Environment Variables / Config Vars
3. Add the same variables as above

---

### Phase 3: Flutterwave Configuration (10 minutes)

1. Log into [Flutterwave Dashboard](https://dashboard.flutterwave.com)
2. Go to **Settings → Webhooks**
3. Add webhook URL:
   ```
   https://your-production-domain.com/api/webhook
   ```
   Replace `your-production-domain.com` with your actual domain
4. Select **Event**: `charge.completed`
5. Copy your **Webhook Secret Hash**
6. Add to `.env` as: `FLUTTERWAVE_SECRET_HASH=your-webhook-secret-hash`

---

### Phase 4: Testing (10 minutes)

#### Test Endpoint (Local Development)
```bash
curl -X POST http://localhost:3001/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-test-email@gmail.com",
    "subject": "NORDLUXE Test",
    "body": "If you see this, emails work!"
  }'
```

#### Test Script
```bash
node test-email.js
```
Edit `test-email.js` to use your test email address.

#### Expected Response
You should receive a test email in your inbox within 30 seconds.

If NOT received:
- ❌ Check `.env` file exists and has correct credentials
- ❌ Verify Gmail 2FA is enabled
- ❌ Verify App Password (not regular Gmail password)
- ❌ Check server logs for errors: `npm start` or `pm2 logs`

---

### Phase 5: Live Payment Test (20 minutes)

1. Start your server locally or deploy to production
2. Go to your site: `http://localhost:3001` or `https://your-domain.com`
3. Add an item to cart
4. Complete checkout with Flutterwave payment
5. Use Flutterwave test card (if in test mode):
   ```
   Card: 4239 9513 2500 9005
   CVV: 909
   Expires: 09/32
   ```
6. Complete payment

#### Check Email Received
- ✅ Should receive order confirmation at customer email within 30 seconds
- ✅ Admin should receive order notification
- ✅ Check server logs for: `"Order confirmation email sent"`

#### If Email NOT Received
Look in server logs for:
```
Attempting to send transactional email
gmailConfigured: true
```

If `gmailConfigured: false` → Email credentials not set in `.env`

---

## 📋 Environment Variables Summary

| Variable | Value | Where From |
|----------|-------|-----------|
| `EMAIL_USER` | your-email@gmail.com | Your Gmail address |
| `EMAIL_PASS` | 16-char app password | Gmail → App passwords |
| `ADMIN_EMAIL` | your-email@gmail.com | Usually same as EMAIL_USER |
| `ADMIN_NOTIFICATION_EMAILS` | your-email@gmail.com | Where you get admin alerts |
| `EMAIL_FROM` | NORDLUXE <nord.luxe01@gmail.com> | How sender appears in email |
| `FLUTTERWAVE_SECRET_HASH` | webhook-secret | Flutterwave Dashboard → Webhooks |

---

## 🔧 Troubleshooting

### "No email provider configured"
**Cause:** `EMAIL_USER` or `EMAIL_PASS` missing in `.env`
**Fix:**
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=abcdefghijklmnop
```

### "Invalid signature" on webhook
**Cause:** `FLUTTERWAVE_SECRET_HASH` doesn't match Flutterwave
**Fix:**
1. Go to Flutterwave Dashboard
2. Check Settings → Webhooks → Webhook Secret Hash
3. Update `.env` with correct hash

### "Missing buyer email recipient"
**Cause:** Customer didn't provide email during checkout
**Fix:** Ensure checkout form requires email

### Email sent to wrong address
**Cause:** Check which email is configured as `ADMIN_EMAIL` or `EMAIL_USER`
**Fix:** Verify `.env` settings

### Server can't reach Gmail
**Cause:** Firewall/network blocking port 587
**Fix:** Check hosting provider allows SMTP on port 587

---

## 📧 What Emails Do Customers Receive?

### After Successful Payment
**Email 1: Order Confirmation** (to customer)
- Order ID and reference number
- Items ordered with images
- Total amount paid
- Payment date
- For preorders: remaining balance due

**Email 2: Admin Notification** (to admin)
- New sale alert
- Customer details
- Item breakdown
- Transaction ID
- Flutterwave payment method

---

## 🚀 Final Deployment Checklist

Before going live:
- [ ] Gmail account has 2FA enabled
- [ ] App Password generated (16 characters)
- [ ] `.env` file has all variables on LOCAL machine
- [ ] Test email works locally: `npm start` then send test email
- [ ] Payment test works locally
- [ ] Production `.env` variables set on hosting platform
- [ ] Flutterwave webhook URL configured
- [ ] Flutterwave webhook secret matches `.env`
- [ ] Domain SSL certificate installed
- [ ] Payment test on production domain
- [ ] Customer receives confirmation email

---

## 📞 When It's Working ✅

After a customer makes a purchase, these things happen automatically:

1. **Webhook fires** → Flutterwave sends `charge.completed` event
2. **Status updates** → Order marked as `confirmed` in database
3. **Customer email sent** → Order confirmation to customer's email
4. **Admin email sent** → Sale notification to admin email
5. **Logs recorded** → Server logs show "Order confirmation email sent"

Check logs to confirm:
```bash
npm start
# Look for: "Order confirmation email sent"
```

Or for production:
```bash
pm2 logs api-server
# Look for: "Order confirmation email sent"
```

---

## 📚 Full Documentation

For more details, see: [PRODUCTION_EMAIL_SETUP.md](PRODUCTION_EMAIL_SETUP.md)

---

## ⚠️ Security Reminders

- ❌ Never share `EMAIL_PASS` or `FLUTTERWAVE_SECRET_HASH` publicly
- ❌ Never commit `.env` to Git (add to `.gitignore`)
- ✅ Use App Password, not your main Gmail password
- ✅ Monitor for failed emails in logs
- ✅ Keep backup of webhook secret

---

## Support

If emails aren't sending:
1. Check `.env` file exists with correct values
2. Check server logs for error messages
3. Test with: `curl -X POST http://localhost:3001/api/test-email ...`
4. Verify Flutterwave webhook is configured
5. Check Gmail account 2FA is enabled

You're all set! 🎉
