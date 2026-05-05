#!/usr/bin/env node
/**
 * Quick test script to verify SMTP email delivery is working
 * Usage: node test-email.js <recipient@email.com>
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

const recipientEmail = process.argv[2] || ADMIN_EMAIL;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error('❌ ERROR: EMAIL_USER and EMAIL_PASS environment variables not set in .env');
  console.error('Current values:');
  console.error('  EMAIL_USER:', EMAIL_USER ? '✓ set' : '✗ MISSING');
  console.error('  EMAIL_PASS:', EMAIL_PASS ? '✓ set' : '✗ MISSING');
  process.exit(1);
}

if (!recipientEmail || !recipientEmail.includes('@')) {
  console.error('❌ ERROR: Valid recipient email required');
  console.error('Usage: node test-email.js recipient@example.com');
  console.error('Or set ADMIN_EMAIL in .env');
  process.exit(1);
}

console.log('🧪 Testing email delivery...');
console.log('  From:', EMAIL_USER);
console.log('  To:', recipientEmail);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

const mailOptions = {
  from: `NORDLUXE <${EMAIL_USER}>`,
  to: recipientEmail,
  subject: 'NORDLUXE Email Delivery Test',
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <h2>✅ Email Delivery Test Successful!</h2>
      <p>If you're reading this, your NORDLUXE email system is working correctly.</p>
      <p><strong>Test Details:</strong></p>
      <ul>
        <li>Sent from: ${EMAIL_USER}</li>
        <li>Sent to: ${recipientEmail}</li>
        <li>Timestamp: ${new Date().toISOString()}</li>
      </ul>
      <p>You can now proceed with testing the full order confirmation flow.</p>
    </div>
  `
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('❌ Email send failed:');
    console.error('  Code:', error.code || 'N/A');
    console.error('  Message:', error.message);
    
    if (error.message.includes('Invalid login')) {
      console.error('\n💡 Hint: Invalid email credentials.');
      console.error('  - Verify EMAIL_USER and EMAIL_PASS in .env');
      console.error('  - If using Gmail with 2FA, use an app-specific password instead');
    }
    
    if (error.message.includes('SMTP')) {
      console.error('\n💡 Hint: SMTP connection issue.');
      console.error('  - Check internet connection');
      console.error('  - Verify Gmail SMTP is accessible (port 587)');
    }
    
    process.exit(1);
  } else {
    console.log('✅ Email sent successfully!');
    console.log('  Message ID:', info.messageId);
    console.log('\n📧 Check your inbox at', recipientEmail);
    console.log('   (May take 1-2 minutes to arrive)');
    process.exit(0);
  }
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Timeout: Email send took too long (30+ seconds)');
  process.exit(1);
}, 30000);
