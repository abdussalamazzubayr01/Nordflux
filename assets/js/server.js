const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Flutterwave = require('flutterwave-node-v3');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AppleStrategy = require('passport-apple');
const session = require('express-session');
const { authenticator } = require('otplib');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('.'));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'nordluxe-secret',
  resave: false,
  saveUninitialized: false
}));

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
const flw = new Flutterwave(
  process.env.FLUTTERWAVE_PUBLIC_KEY,
  process.env.FLUTTERWAVE_SECRET_KEY
);

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// MongoDB connection (optional - for storing orders)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));
}

// Order Schema
const orderSchema = new mongoose.Schema({
  customerEmail: String,
  customerName: String,
  items: Array,
  totalAmount: Number,
  flutterwaveRef: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
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

// Routes

// Initialize payment
app.post('/api/initiate-payment', async (req, res) => {
  try {
    const { amount, currency, customer, items, redirect_url } = req.body;

    const payload = {
      tx_ref: `nordluxe-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      amount: amount,
      currency: currency || 'USD',
      redirect_url: redirect_url || `${process.env.FRONTEND_URL}/thank-you.html`,
      payment_options: 'card,mobilemoney,ussd',
      customer: {
        email: customer.email,
        phonenumber: customer.phone,
        name: customer.name
      },
      customizations: {
        title: 'NORDLUXE Purchase',
        description: 'Luxury Scandinavian Fashion',
        logo: `${process.env.FRONTEND_URL}/sa.jpg`
      }
    };

    const response = await flw.Charge.card(payload);

    // Save order to database
    if (mongoose.connection.readyState === 1) {
      const order = new Order({
        customerEmail: customer.email,
        customerName: customer.name,
        items: items,
        totalAmount: amount,
        flutterwaveRef: payload.tx_ref
      });
      await order.save();
    }

    res.json({
      success: true,
      data: response
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
          { status: 'completed' }
        );
      }

      // Send confirmation email
      await sendOrderConfirmationEmail(response.data);

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
app.post('/api/webhook', (req, res) => {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const signature = req.headers['verif-hash'];

  if (!signature || signature !== secretHash) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  const payload = req.body;

  // Verify the event
  if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
    console.log('Payment completed:', payload.data);

    // Send notification email
    sendPaymentNotificationEmail(payload.data);

    // Update order status in database
    if (mongoose.connection.readyState === 1) {
      Order.findOneAndUpdate(
        { flutterwaveRef: payload.data.tx_ref },
        { status: 'completed' }
      ).catch(err => console.error('Database update error:', err));
    }
  }

  res.status(200).json({ status: 'ok' });
});

// Send order confirmation email
async function sendOrderConfirmationEmail(paymentData) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: paymentData.customer.email,
    subject: 'NORDLUXE - Order Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #d19b48; text-align: center;">Thank You for Your Purchase!</h1>
        <p>Dear ${paymentData.customer.name},</p>
        <p>Your order has been successfully processed. Here are the details:</p>

        <div style="background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 10px;">
          <h3>Order Details:</h3>
          <p><strong>Transaction ID:</strong> ${paymentData.id}</p>
          <p><strong>Amount:</strong> ${paymentData.currency} ${paymentData.amount}</p>
          <p><strong>Payment Method:</strong> ${paymentData.payment_type}</p>
          <p><strong>Date:</strong> ${new Date(paymentData.created_at).toLocaleDateString()}</p>
        </div>

        <p>You will receive a shipping confirmation email once your order ships.</p>

        <p style="color: #d19b48; font-weight: bold;">NORDLUXE - Scandinavian Luxury Fashion</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Order confirmation email sent');
  } catch (error) {
    console.error('Email sending error:', error);
  }
}

// Send payment notification to store owner
async function sendPaymentNotificationEmail(paymentData) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL,
    subject: 'NEW SALE - NORDLUXE Order Received',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #d19b48;">🎉 New Sale Alert!</h1>
        <p>You have received a new order:</p>

        <div style="background: #f9f9f9; padding: 20px; margin: 20px 0; border-radius: 10px;">
          <h3>Customer Details:</h3>
          <p><strong>Name:</strong> ${paymentData.customer.name}</p>
          <p><strong>Email:</strong> ${paymentData.customer.email}</p>
          <p><strong>Phone:</strong> ${paymentData.customer.phone || 'Not provided'}</p>

          <h3>Payment Details:</h3>
          <p><strong>Transaction ID:</strong> ${paymentData.id}</p>
          <p><strong>Reference:</strong> ${paymentData.tx_ref}</p>
          <p><strong>Amount:</strong> ${paymentData.currency} ${paymentData.amount}</p>
          <p><strong>Payment Method:</strong> ${paymentData.payment_type}</p>
          <p><strong>Status:</strong> ${paymentData.status}</p>
          <p><strong>Date:</strong> ${new Date(paymentData.created_at).toLocaleString()}</p>
        </div>

        <p>Please process this order promptly.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Payment notification email sent to admin');
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
      from: process.env.EMAIL_USER,
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

    await transporter.sendMail(mailOptions);
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`NORDLUXE backend server running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/api/webhook`);
});

module.exports = app;