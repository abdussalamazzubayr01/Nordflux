# Production Email Setup Guide - NORDLUXE

This guide walks you through setting up real, transactional email delivery for your NORDLUXE e-commerce platform after purchase confirmations.

## Overview

Your application currently has email infrastructure set up that:
- Sends order confirmation emails to customers after successful Flutterwave payment
- Sends payment notifications to admins
- Uses Gmail SMTP via Nodemailer
- Sends emails triggered by webhook when `charge.completed` event fires from Flutterwave

## Step 1: Create/Verify Gmail Account

You need a dedicated Gmail account for sending transactional emails. This can be:
- A new Gmail account specifically for NORDLUXE (recommended)
- An existing business Gmail account

**Important**: You'll use a special "App Password", NOT your regular Gmail password.

### Email Recommendation
Consider using: `noreply@yourdomain.com` or `orders@yourdomain.com` if you have a custom domain with Gmail forwarding. For now, we'll use a Gmail account.

---

## Step 2: Generate Gmail App Password

Gmail no longer allows "less secure apps" to use your main password. Instead, you must use an App Password:

### Instructions:

1. **Enable 2-Factor Authentication on your Gmail account**
   - Go to myaccount.google.com
   - Click "Security" in left sidebar
   - Find "2-Step Verification" and enable it
   - You'll need to verify with your phone

2. **Generate App Password**
   - After 2FA is enabled, go back to Security
   - Look for "App passwords" (it only appears after 2FA is on)
   - Select "Mail" and "Windows" (or your OS)
   - Google generates a 16-character password
   - **Copy this password** (you'll need it for .env)

3. **Example**
   ```
   Gmail: your-email@gmail.com
   App Password: abcd efgh ijkl mnop (copy without spaces: abcdefghijklmnop)
   ```

---

## Step 3: Update Environment Variables

Create or update your `.env` file on the production server with:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=abcdefghijklmnop
ADMIN_EMAIL=your-email@gmail.com
ADMIN_NOTIFICATION_EMAILS=your-email@gmail.com,optional-backup@gmail.com

# Email sender display name (customers see this)
EMAIL_FROM=NORDLUXE <nord.luxe01@gmail.com>

# Flutterwave webhook secret (from your Flutterwave dashboard)
FLUTTERWAVE_SECRET_HASH=your_webhook_secret_hash
```

### Where to set these:

**Local Development (.env file)**
```
c:\Users\USER\OneDrive\Desktop\NORDLUXE\.env
```

**Vercel Deployment** (if using Vercel)
- Go to your project settings
- Click "Environment Variables"
- Add each variable separately:
  - `EMAIL_USER`
  - `EMAIL_PASS`
  - `ADMIN_EMAIL`
  - `EMAIL_FROM`
  - `FLUTTERWAVE_SECRET_HASH`

**Other Hosting** (Heroku, Railway, etc.)
- Consult your provider's docs for setting environment variables
- Usually in Dashboard → Settings → Config Vars

---

## Step 4: Configure Flutterwave Webhook

The payment confirmation emails are triggered by Flutterwave's webhook when payment succeeds. You must configure this:

1. **Get your webhook URL**
   ```
   https://your-domain.com/api/webhook
   ```
   Replace `your-domain.com` with your actual production domain.

2. **Flutterwave Dashboard Setup**
   - Log into Flutterwave dashboard
   - Go to Settings → Webhooks
   - Add webhook URL: `https://your-domain.com/api/webhook`
   - Select Events: `charge.completed`
   - Get your **Webhook Secret Hash**
   - Add it to `.env` as `FLUTTERWAVE_SECRET_HASH`

3. **Test Webhook**
   - Send a test payment through your site
   - Check server logs for email sending attempts
   - Verify email arrives in customer's inbox

---

## Step 5: Test Email Delivery

### Test via Provided Endpoint

Your app has a test email endpoint:

```bash
curl -X POST http://localhost:3001/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "body": "This is a test"
  }'
```

### Test via Node Script

A test script is included:

```bash
node test-email.js
```

Edit `test-email.js` to customize the test email recipient.

### Verify Logs

When emails send, you should see in server logs:
```
Attempting to send transactional email to: customer@example.com {
  gmailConfigured: true,
  resendConfigured: false
}
```

---

## Step 6: Monitor Production Emails

After deployment, monitor email delivery:

### Check Server Logs
```bash
# If using PM2:
pm2 logs api-server

# If using systemd:
journalctl -u nordluxe -f
```

### Look for these log messages:
```
Payment completed: [payment data]
Buyer confirmation send: Successfully sent
Internal notification send: Successfully sent
```

### Troubleshoot Email Issues

**Email not sending?** Check:
- ✅ `EMAIL_USER` and `EMAIL_PASS` are correct in `.env`
- ✅ Gmail account has 2FA enabled
- ✅ App Password is being used (not regular Gmail password)
- ✅ `ADMIN_EMAIL` is set
- ✅ Server can reach `smtp.gmail.com:587` (not blocked by firewall)

**Customer not receiving emails?** Check:
- ✅ Email address in order is correct
- ✅ Payment webhook was triggered by Flutterwave
- ✅ No spam filter is blocking `nord.luxe01@gmail.com`

**Admin not receiving notifications?** Check:
- ✅ `ADMIN_EMAIL` is correct
- ✅ `ADMIN_NOTIFICATION_EMAILS` includes the email

---

## Step 7: Deployment Checklist

Before going live:

- [ ] Gmail account created with 2FA enabled
- [ ] 16-char App Password generated
- [ ] `.env` file has `EMAIL_USER` and `EMAIL_PASS`
- [ ] `.env` file has `ADMIN_EMAIL`
- [ ] Flutterwave webhook URL configured
- [ ] Flutterwave webhook secret added to `.env`
- [ ] Test email sent successfully
- [ ] Server can reach `smtp.gmail.com:587`
- [ ] Domain configured in DNS
- [ ] SSL certificate installed (for HTTPS)
- [ ] Test purchase completed and confirmation email received

---

## Email Content Customization

Emails are sent with pre-built templates from:
- **Customer confirmation**: `renderEmailLayout()` function in `api/server.js`
- **Admin notification**: Built into webhook handler

To customize:
1. Edit `api/server.js` around line 729 (`renderEmailLayout` function)
2. Modify HTML template
3. Restart server

---

## Switching Email Providers

Currently configured: **Gmail SMTP (Nodemailer)**

Alternative options ready to use:

### Option A: Resend
```env
RESEND_API_KEY=re_your_api_key_here
# No need for EMAIL_USER/EMAIL_PASS
```
Code already supports this in `api/server.js` line 518.

### Option B: SendGrid, AWS SES, etc.
Edit `api/server.js` lines 490-527 to integrate your provider.

---

## Common Email Variables

These are available for use in email templates:

- `order.customerEmail` - Customer email
- `order.customerName` - Customer name
- `order.totalAmount` - Order total
- `order.items` - Array of items ordered
- `order.status` - Order status (confirmed, pending, etc.)
- `order.flutterwaveRef` - Unique order ID
- `order.createdAt` - Order timestamp

---

## Security Notes

⚠️ **Never commit `.env` to version control**
- `.gitignore` should include `.env`
- Only share credentials with your hosting provider

✅ **Use App Passwords, not main Gmail password**
- More secure and revocable
- Can be regenerated anytime

✅ **Monitor email delivery**
- Keep logs for troubleshooting
- Track undelivered emails

---

## Support Resources

- [Gmail App Passwords Help](https://support.google.com/accounts/answer/185833)
- [Nodemailer Gmail](https://nodemailer.com/smtp/gmail/)
- [Flutterwave Webhooks](https://developer.flutterwave.com/docs/webhooks/)

---

## Next Steps

1. Generate Gmail App Password (Step 2)
2. Update `.env` with credentials (Step 3)
3. Configure Flutterwave webhook (Step 4)
4. Test email delivery (Step 5)
5. Deploy to production
6. Monitor logs for successful email sending

Your email system is now ready for production! 🚀
