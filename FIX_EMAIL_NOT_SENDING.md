# 🔧 NORDLUXE Email Not Sending - Diagnostic Guide

## Problem
✅ You receive Flutterwave payment confirmation  
❌ You do NOT receive NORDLUXE order confirmation email

## Root Cause
The **webhook signature verification is failing**. When Flutterwave sends the `charge.completed` event to your server, the signature doesn't match what's configured in your `.env` file.

```
Flutterwave sends webhook → Server checks signature → ❌ MISMATCH → Emails never sent
```

---

## Quick Fix (3 Steps)

### Step 1: Get Your Real Webhook Secret

1. Go to [Flutterwave Dashboard](https://dashboard.flutterwave.com/settings/webhooks) (Settings → Webhooks)
2. Look for **"Webhook Secret Hash"** or **"Webhook Secret"**
3. **Copy the entire secret** (it's usually a long alphanumeric string)

**Example of what it looks like:**
```
50e52e0f8b9c9f5a8b3c4f5e6d7c8b9a
```

### Step 2: Update Your `.env` File

In `c:\Users\USER\OneDrive\Desktop\NORDLUXE\.env`:

**BEFORE:**
```env
FLUTTERWAVE_SECRET_HASH=nordluxe_flw_test_hash_2026_04_07_9c3f7b1a
```

**AFTER:**
```env
FLUTTERWAVE_SECRET_HASH=50e52e0f8b9c9f5a8b3c4f5e6d7c8b9a
```

(Replace with your actual secret from Flutterwave)

### Step 3: Restart Your Server

```bash
npm start
```

Or if using PM2:
```bash
pm2 restart api-server
pm2 logs api-server
```

---

## Test If It Works Now

### Option 1: Make a Real Payment (Recommended)
1. Go to your site
2. Add an item to cart
3. Complete checkout with Flutterwave
4. **Check your email inbox for NORDLUXE confirmation**

### Option 2: Use Test Endpoint (Quick Debug)

Run this command to test email sending WITHOUT needing the correct signature:

```bash
curl -X POST http://localhost:3001/api/webhook-test \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "tx_ref": "nl-test-email-1234",
      "customer": {
        "email": "your-test-email@gmail.com",
        "name": "Test Customer"
      },
      "amount": 50000,
      "currency": "NGN",
      "payment_type": "card",
      "created_at": "2026-05-24T12:00:00.000Z"
    }
  }'
```

**Expected result:** You should receive a test email to `your-test-email@gmail.com`

---

## How to Check What Flutterwave Is Sending

If you're still not receiving emails after updating the secret, **check your server logs**:

```bash
npm start
```

Look for these messages:

### ✅ GOOD - Signature matches:
```
[WEBHOOK] Expected Hash: 50e52e0f8b9c9f5a8b3c4f5e6d7c8b9a
[WEBHOOK] Received Hash: 50e52e0f8b9c9f5a8b3c4f5e6d7c8b9a
[WEBHOOK] Hash Match: true
[WEBHOOK] ✅ Signature verified - processing event
[WEBHOOK] 💰 Payment completed: {...}
[WEBHOOK] ✅ BUYER CONFIRMATION EMAIL SENT
[WEBHOOK] ✅ ADMIN NOTIFICATION EMAIL SENT
```

### ❌ BAD - Signature doesn't match:
```
[WEBHOOK] Expected Hash: nordluxe_flw_test_hash_2026_04_07_9c3f7b1a
[WEBHOOK] Received Hash: 50e52e0f8b9c9f5a8b3c4f5e6d7c8b9a
[WEBHOOK] Hash Match: false
[WEBHOOK] ❌ SIGNATURE VERIFICATION FAILED
```

If you see this, **the secret in your `.env` is WRONG**. Update it with the correct one from Flutterwave.

---

## Verify Your `.env` Settings

Make sure you have ALL these variables set:

```env
✅ EMAIL_USER=nord.luxe01@gmail.com
✅ EMAIL_PASS=your_app_password_here
✅ ADMIN_EMAIL=nord.luxe01@gmail.com
✅ FLUTTERWAVE_SECRET_HASH=YOUR_ACTUAL_SECRET_HERE  ← UPDATE THIS!
✅ FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST_your_public_key_here
✅ FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST_your_secret_key_here
```

---

## Is Your Webhook URL Correct?

Flutterwave won't send webhooks if the URL isn't configured. Check this:

1. **Local Development:**
   - Make sure your server is running: `npm start`
   - Flutterwave should send to: (This won't work - webhooks need HTTPS)
   - **For local testing:** Use test endpoint instead: `/api/webhook-test`

2. **Production:**
   - Webhook URL should be: `https://your-domain.com/api/webhook`
   - Must use HTTPS (not HTTP)
   - Must be publicly accessible

**To check in Flutterwave:**
1. Go to Flutterwave Dashboard → Settings → Webhooks
2. Verify webhook URL is configured correctly
3. Make sure "Charge Completed" event is selected

---

## Email Sending Verification

If webhook signature is correct but emails still not sending, check:

1. **Gmail credentials are correct:**
   ```env
   EMAIL_USER=nord.luxe01@gmail.com
   EMAIL_PASS=your_app_password_here
   ```

2. **Test email directly:**
   ```bash
   curl -X POST http://localhost:3001/api/test-email \
     -H "Content-Type: application/json" \
     -d '{"to":"your-email@gmail.com","subject":"Test","body":"Test"}'
   ```

3. **Check server logs for:**
   ```
   "Attempting to send transactional email"
   "Order confirmation email sent"
   ```

---

## Step-by-Step Checklist

- [ ] Log into Flutterwave Dashboard
- [ ] Go to Settings → Webhooks
- [ ] Copy the webhook secret hash
- [ ] Update `.env` with the secret
- [ ] Restart server: `npm start`
- [ ] Check logs show "Signature verified"
- [ ] Make a test payment
- [ ] ✅ Receive confirmation email

---

## Common Issues & Fixes

### "Invalid signature" error
**Problem:** Webhook secret in `.env` doesn't match Flutterwave  
**Fix:** Copy the EXACT secret from Flutterwave dashboard

### Email fails but signature passes
**Problem:** Webhook passes but emails don't send  
**Fix:**
```bash
curl -X POST http://localhost:3001/api/webhook-test \
  -H "Content-Type: application/json" \
  -d '{...}'
```
Check if test email works. If not, check Gmail credentials.

### "No email provider configured"
**Problem:** EMAIL_USER or EMAIL_PASS missing  
**Fix:** Add to `.env`:
```env
EMAIL_USER=nord.luxe01@gmail.com
EMAIL_PASS=your_app_password_here
```

### Email received but from wrong address
**Problem:** Email shows different sender  
**Fix:** Check `EMAIL_FROM` in `.env`:
```env
EMAIL_FROM=NORDLUXE <nord.luxe01@gmail.com>
```

---

## Getting Help

**Check server logs for error details:**
```bash
npm start
# Look for [WEBHOOK] messages
# Look for "send error"
# Look for "Email failed"
```

**Common error messages:**

| Error | Meaning | Fix |
|-------|---------|-----|
| `Invalid signature` | Webhook secret mismatch | Update `.env` with correct secret |
| `No email provider configured` | EMAIL_USER/PASS missing | Add credentials to `.env` |
| `Gmail Authentication Failed` | Wrong email password | Use app password, not main Gmail password |
| `ECONNREFUSED` | Gmail SMTP unreachable | Check firewall, Gmail 2FA enabled |

---

## Once It's Working

After you receive your first confirmation email from NORDLUXE:

✅ **Email workflow is live**  
✅ **All future purchases will auto-send confirmations**  
✅ **Admin will receive sale alerts**  
✅ **Ready for production**

---

## Next Steps

1. **Find your webhook secret** in Flutterwave dashboard
2. **Update `.env` file** with the secret
3. **Restart server** and check logs
4. **Make a test payment** to verify
5. **Check inbox** for NORDLUXE confirmation email

Need more help? See:
- [PRODUCTION_EMAIL_SETUP.md](PRODUCTION_EMAIL_SETUP.md) - Full technical guide
- [EMAIL_DEBUGGING_GUIDE.md](EMAIL_DEBUGGING_GUIDE.md) - Original debugging guide

You're almost there! 🚀
