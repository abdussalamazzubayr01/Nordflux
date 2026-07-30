# Email Delivery Debugging Guide

## What Was Fixed

1. **Enhanced Logging**: Added detailed console logs showing exactly when emails are being sent and any errors that occur
2. **Webhook Error Handling**: Added try-catch blocks around email sending in the webhook handler to catch and log errors
3. **Test Endpoint**: Created `/api/test-email` endpoint to manually test email delivery
4. **Test Script**: Created `test-email.js` script to verify SMTP credentials and connectivity

## Current Email Setup

- **SMTP Server**: Gmail (smtp.gmail.com:587)
- **Authentication**: Uses EMAIL_USER and EMAIL_PASS from .env
- **Email Credential Location**: `.env` file in project root
- **Email Configuration**: `.env` lines 14-16

```
EMAIL_USER=nord.luxe01@gmail.com
EMAIL_PASS=your_app_password_here
ADMIN_EMAIL=nord.luxe01@gmail.com
```

## Quick Test Steps

### Step 1: Verify Backend is Running
```bash
# In one terminal, start the backend
npm start
# Should show: Backend server listening on port 3001
```

### Step 2: Test Email Credentials
```bash
# In another terminal, run the test script
node test-email.js
# Or test to a specific email
node test-email.js your-email@gmail.com
```

**Expected Output:**
```
🧪 Testing email delivery...
  From: nord.luxe01@gmail.com
  To: your-email@gmail.com
✅ Email sent successfully!
  Message ID: <some-id>
```

**If It Fails:**
- Check the error message displayed
- Verify EMAIL_USER and EMAIL_PASS are correctly set in .env
- If using Gmail with 2FA, ensure you're using an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password

### Step 3: Test Email via API Endpoint
```bash
# While backend is running, make a POST request to test email
curl -X POST http://localhost:3001/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@gmail.com",
    "type": "generic",
    "subject": "Test Email"
  }'
```

**Response on Success:**
```json
{
  "success": true,
  "message": "Test generic email sent",
  "to": "your-email@gmail.com",
  "messageId": "<message-id>"
}
```

### Step 4: Test Full Order Confirmation Flow

1. Start backend: `npm start`
2. Start frontend proxy: `npm run start:static` (in another terminal)
3. Go to http://localhost:8000
4. Complete a test purchase using Flutterwave test card
5. Check backend console for logging output during payment
6. Watch for these logs:
   ```
   📬 sendOrderConfirmationEmail called with...
   ✓ Recipient email resolved...
   ✓ Buyer email confirmed...
   📧 Attempting to send order confirmation email...
   ✅ Order confirmation email sent successfully
   ```

## Email Sending Flow

### During Payment Completion:

1. **Frontend initiates payment** → Flutterwave checkout opens
2. **User completes payment** → Flutterwave redirects back
3. **Frontend verifies payment** → POST to `/api/verify-payment`
4. **Backend receives confirmation** → Triggers `sendOrderConfirmationEmail()`
5. **Email sent to buyer** → Arrives in inbox within 1-2 minutes

### Additional Trigger Point:

- **Flutterwave webhook** (after 30 seconds) → Also triggers email send as fallback

## Troubleshooting

### Issue: "Invalid login" Error
- Solution: Gmail password must be an [App Password](https://support.google.com/accounts/answer/185833) if 2FA is enabled
- Steps: 
  1. Go to Google Account Security (myaccount.google.com/security)
  2. Find "App passwords" in the Signing in to Google section
  3. Generate password for "Mail" and "Windows Computer"
  4. Replace EMAIL_PASS in .env with this 16-character password

### Issue: "SMTP connection refused"
- Solution: Check firewall/network
- Verify: You can ping smtp.gmail.com or access Gmail in browser
- Check: Port 587 is not blocked by ISP/firewall

### Issue: Email arrives in Spam
- Solution: Add sender to contacts, mark as "Not Spam"
- Gmail may flag new senders as spam until they have a history

### Issue: No console logs appear
- Solution: Restart backend server after making code changes
- Command: Stop current process (Ctrl+C), then `npm start` again

## Advanced Testing

### Test Order Confirmation Email Directly
```bash
curl -X POST http://localhost:3001/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "customer@example.com",
    "type": "order-confirmation"
  }'
```

### Monitor Live Logs
Keep terminal window focused on backend server to see real-time logs:
```
[timestamp] 📬 sendOrderConfirmationEmail called with...
[timestamp] ✓ Buyer email confirmed: customer@example.com
[timestamp] 📧 Attempting to send order confirmation email...
[timestamp] ✅ Order confirmation email sent successfully
```

## Files Modified

- `assets/js/server.js`: Added logging, webhook error handling, test endpoint
- `test-email.js`: New debugging script
- This file: `EMAIL_DEBUGGING_GUIDE.md`

## Environment Variables Required

For email to work, ensure `.env` has:
```
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password
ADMIN_EMAIL=admin@example.com
```

## Next Steps

1. Run `node test-email.js` to verify SMTP works
2. Restart backend: `npm start`
3. Make a test purchase
4. Watch console for email delivery logs
5. Check buyer inbox for confirmation email

If email still not arriving after following these steps, share the console logs from steps 1 and 3 for further debugging.
