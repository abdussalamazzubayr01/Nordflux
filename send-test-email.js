require('dotenv').config();
const nodemailer = require('nodemailer');

async function sendOrderConfirmation(customerData) {
  try {
    // Create transporter
    const gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Customer email template
    const customerMailOptions = {
      from: `NORDLUXE <${process.env.EMAIL_USER}>`,
      to: customerData.email,
      subject: 'NORDLUXE - Order Confirmation',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; background:#f8f4eb; padding:20px;">
          <div style="max-width:680px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e8dcc7;">
            
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#19140f,#3c2a18);padding:30px;text-align:center;">
              <img 
                src="https://www.nordluxe.io/assets/images/sa.jpg" 
                alt="NORDLUXE"
                width="80"
                style="border-radius:12px;"
              >
              <h1 style="color:#f5dfb4;margin-top:15px;letter-spacing:2px;">
                NORDLUXE
              </h1>
              <p style="color:#dcb87a;">
                Order Confirmation
              </p>
            </div>

            <!-- Body -->
            <div style="padding:30px;">
              <h2 style="color:#2d1f11;">
                Thank You For Your Purchase
              </h2>

              <p>Hello ${customerData.name},</p>

              <p>
                Your order has been successfully confirmed.
              </p>

              <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:20px 0;">
                <h3 style="color:#6e4b1e;margin-top:0;">
                  Order Summary
                </h3>

                <p><strong>Order ID:</strong> ${customerData.orderId}</p>
                <p><strong>Amount Paid:</strong> NGN ${customerData.amount}</p>
                <p><strong>Payment Method:</strong> ${customerData.paymentMethod}</p>
                <p><strong>Status:</strong> Confirmed</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
              </div>

              <div style="background:#f8f4eb;border:1px solid #e8dcc7;border-radius:12px;padding:16px;margin:20px 0;">
                <h3 style="color:#6e4b1e;margin-top:0;">
                  Delivery Process
                </h3>

                <p>✓ Your order is being prepared</p>
                <p>✓ Packaging will begin shortly</p>
                <p>✓ Tracking details will be sent via email</p>
                <p>✓ Delivery estimated within 5–7 business days</p>
              </div>

              <p>
                If you have any questions, contact us at:
                <strong>nord.luxe01@gmail.com</strong>
              </p>

              <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e8dcc7;">
                <strong style="color:#d19b48;">
                  NORDLUXE Team
                </strong>
                <br>
                Lagos, Nigeria — Command Every Room
              </div>
            </div>

          </div>
        </div>
      `
    };

    // Admin email notification
    const adminMailOptions = {
      from: `NORDLUXE <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: '🛒 New NORDLUXE Order',
      html: `
        <div style="font-family: Arial, sans-serif; padding:20px;">
          <h2>New Order Received</h2>

          <p><strong>Customer:</strong> ${customerData.name}</p>
          <p><strong>Email:</strong> ${customerData.email}</p>
          <p><strong>Phone:</strong> ${customerData.phone}</p>
          <p><strong>Order ID:</strong> ${customerData.orderId}</p>
          <p><strong>Amount:</strong> NGN ${customerData.amount}</p>
          <p><strong>Payment Method:</strong> ${customerData.paymentMethod}</p>
        </div>
      `
    };

    // Send customer email
    await gmailTransporter.sendMail(customerMailOptions);

    // Send admin email
    await gmailTransporter.sendMail(adminMailOptions);

    console.log('✅ Emails sent successfully');

  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
  }
}

/*
====================================================
TEST DATA
====================================================
*/

sendOrderConfirmation({
  name: 'Ariff Adeshola',
  email: 'adesholaariff@gmail.com',
  phone: '+2348012345678',
  orderId: 'NLX-XU4N6MWS',
  amount: '76,000',
  paymentMethod: 'Card'
});
