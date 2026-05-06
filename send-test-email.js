require('dotenv').config();
const nodemailer = require('nodemailer');

const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const mailOptions = {
  from: 'NORDLUXE <nord.luxe01@gmail.com>',
  to: 'adesholaariff@gmail.com',
  subject: 'NORDLUXE - Order Confirmation',
  html: `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color: #d19b48;">Thank You For Your Purchase!</h2>
      <p>Dear Valued Customer,</p>
      <p>Your order has been successfully received and confirmed. Here are your order details:</p>
      
      <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
        <h3 style="color:#6e4b1e;">Order Summary</h3>
        <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Order Status:</strong> ✅ Confirmed</p>
        <p><strong>Total Amount:</strong> NGN 50,000</p>
        <p><strong>Item:</strong> Nigerian Luxury Fashion Piece</p>
      </div>

      <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:16px 0;">
        <h3 style="color:#6e4b1e;">What's Next?</h3>
        <p>✓ Your order is being prepared</p>
        <p>✓ We will pack it with care</p>
        <p>✓ You'll receive a tracking number via email</p>
        <p>✓ Estimated delivery in 5-7 business days</p>
      </div>

      <p>If you have any questions about your order, please don't hesitate to contact us at <strong>nord.luxe01@gmail.com</strong></p>
      
      <p style="margin-top: 30px; border-top: 1px solid #e8dcc7; padding-top: 20px;">
        Best regards,<br>
        <strong style="color: #d19b48;">NORDLUXE Team</strong><br>
        Nigerian Luxury Fashion — Lagos
      </p>
    </div>
  `
};

gmailTransporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log('❌ Email failed:', error.message);
    process.exit(1);
  } else {
    console.log('✅ Email sent successfully!');
    console.log('📧 To: adesholaariff@gmail.com');
    console.log('📤 Response:', info.response);
    process.exit(0);
  }
});
