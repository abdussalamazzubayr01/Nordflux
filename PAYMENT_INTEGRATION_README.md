# NORDLUXE Payment Integration Guide

## 🚀 Flutterwave Payment Integration Setup

This guide will help you integrate Flutterwave payment processing with your NORDLUXE fashion website.

### 📋 Prerequisites

1. **Flutterwave Account**: Sign up at [flutterwave.com](https://flutterwave.com)
2. **Node.js**: Version 14 or higher
3. **MongoDB**: For storing orders (optional but recommended)
4. **Gmail Account**: For email notifications

### 🔧 Step 1: Install Dependencies

```bash
npm install
```

### 🔧 Step 2: Configure Environment Variables

1. Copy the `.env` file and fill in your credentials:

```env
# Flutterwave Configuration
FLUTTERWAVE_PUBLIC_KEY=your_flutterwave_public_key_here
FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key_here
FLUTTERWAVE_SECRET_HASH=your_webhook_secret_hash_here

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password_here
ADMIN_EMAIL=your_admin_email@gmail.com

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:8000

# Database (Optional)
MONGODB_URI=mongodb://localhost:27017/nordluxe
```

### 🔧 Step 3: Get Flutterwave Credentials

1. **Login to Flutterwave Dashboard**
2. **Go to Settings > API**
3. **Copy your Public Key and Secret Key**
4. **Generate a Webhook Secret Hash**

### 🔧 Step 4: Setup Gmail for Notifications

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security > 2-Step Verification > App passwords
   - Generate password for "Mail"
3. **Use the App Password** in your `.env` file (not your regular password)

### 🔧 Step 5: Configure Webhook URL

1. **In Flutterwave Dashboard**:
   - Go to Settings > Webhooks
   - Add webhook URL: `https://yourdomain.com/api/webhook`
   - Select events: `charge.completed`
   - Set the Secret Hash from your `.env` file

### 🚀 Step 6: Start the Servers

```bash
# Start the backend server
npm run dev

# In another terminal, start the frontend
python -m http.server 8000
```

### 📧 Step 7: Test the Integration

1. **Add items to cart** from collections.html
2. **Go to cart.html** and fill in customer details
3. **Click "Complete Purchase"**
4. **You'll be redirected to Flutterwave's secure checkout**
5. **Complete payment with test card details**
6. **You'll be taken to the beautiful thank-you.html page**
7. **You'll receive email notifications**

### 🧪 Test Card Details (Flutterwave)

```
Card Number: 5531886652142950
CVV: 564
Expiry: 09/32
PIN: 3310
OTP: 12345
```

### 📱 API Endpoints

- `POST /api/initiate-payment` - Start payment process
- `GET /api/verify-payment/:id` - Verify payment status
- `POST /api/webhook` - Handle payment webhooks
- `GET /api/health` - Health check

### 📧 Email Notifications

The system sends:
- **Order Confirmation** to customers
- **Sales Alerts** to store admin
- **Payment Success** notifications

### 🔒 Security Features

- Webhook signature verification
- Input validation
- CORS protection
- Environment variable protection

### 🗄️ Database Schema (Optional)

If using MongoDB, orders are stored with:
- Customer information
- Order items
- Payment status
- Transaction references

### 🚀 Production Deployment

1. **Set up domain and SSL**
2. **Update webhook URL** in Flutterwave dashboard
3. **Configure production environment variables**
4. **Set up MongoDB database**
5. **Deploy backend to Heroku/AWS/DigitalOcean**
6. **Update frontend API calls** to production URL

### 🆘 Troubleshooting

**Common Issues:**

1. **"Payment initiation failed"**
   - Check Flutterwave API keys
   - Verify `.env` configuration

2. **"Invalid signature" in webhooks**
   - Ensure webhook secret hash matches

3. **Emails not sending**
   - Check Gmail app password
   - Verify email credentials

4. **CORS errors**
   - Add your domain to CORS origins in server.js

### 📞 Support

- **Flutterwave Docs**: [developer.flutterwave.com](https://developer.flutterwave.com)
- **NORDLUXE Issues**: Create GitHub issues for bugs

---

**🎉 Your NORDLUXE store is now ready to accept payments!**