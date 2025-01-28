require('dotenv').config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");

const app = express();

const isDevelopment = process.env.NODE_ENV !== 'production';

// Update CORS configuration
app.use(cors({
  origin: isDevelopment 
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
    : ['https://foodles.shop', 'https://www.foodles.shop'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Welcome to the backend!');
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

const contactEmail = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

contactEmail.verify((error) => {
  if (error) {
    console.error("Email transport verification failed:", error);
  } else {
    console.log("Email service ready");
  }
});

app.get('/razorpay-key', (req, res) => {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
});

const formatOrderDetails = (orderDetails, orderId) => {
  return `
    <table class="order-table">
      <tr>
        <th>Item</th>
        <th style="text-align: right;">Quantity</th>
        <th style="text-align: right;">Price</th>
      </tr>
      ${orderDetails.items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td style="text-align: right;">${item.quantity}</td>
          <td style="text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join('')}
      <tr>
        <td>Subtotal</td>
        <td></td>
        <td style="text-align: right;">₹${orderDetails.subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Delivery Fee</td>
        <td></td>
        <td style="text-align: right;">₹${orderDetails.deliveryFee.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Convenience Fee</td>
        <td></td>
        <td style="text-align: right;">₹${orderDetails.convenienceFee.toFixed(2)}</td>
      </tr>
      ${orderDetails.dogDonation > 0 ? `
        <tr>
          <td>Dog Donation</td>
          <td></td>
          <td style="text-align: right;">₹${orderDetails.dogDonation.toFixed(2)}</td>
        </tr>
      ` : ''}
    </table>
    <p>Grand Total: ₹${orderDetails.grandTotal.toFixed(2)}</p>
    <table class="delivery-info">
      <tr>
        <th>Delivery Address</th>
        <th style="text-align: right;">Order ID</th>
      </tr>
      <tr>
        <td>${orderDetails.deliveryAddress}</td>
        <td style="text-align: right;">#${orderId}</td>
      </tr>
    </table>
  `;
};

const isValidEmail = (email) => {
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sendOrderConfirmationEmail = (name, email, orderDetails, orderId) => {
  return new Promise((resolve, reject) => {
    if (!isValidEmail(email)) {
      reject(new Error("Invalid customer email address"));
      return;
    }

    const formattedOrderDetails = formatOrderDetails(orderDetails, orderId);

    const mail = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Order Confirmation",
      html: `
        <link rel="stylesheet" href="styles.css">
        <table width="600" cellpadding="20" cellspacing="0" style="font-family: Arial, sans-serif; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; background-color: #141414; color: #f9f9f9;">
          <tr>
            <td>
              <h2 class="glow" style="color: #7c3aed;">Order Confirmation</h2>
              <p>Dear ${name},</p>
              ${formattedOrderDetails}
              <p>Thank you for your order. We'll keep you updated on the status.</p>
              <p>Best regards,</p>
              <p>Foodles Team</p>
            </td>
          </tr>
        </table>
      `,
    };

    contactEmail.sendMail(mail, (error, info) => {
      if (error) {
        console.error("Contact email error:", error);
        reject(error);
      } else if (info.rejected.length > 0) {
        console.error(`Email rejected for ${email}`);
        reject(new Error("Email delivery failed"));
      } else {
        console.log(`Email delivered successfully to ${email}`);
        resolve(true);
      }
    });
  });
};

const sendOrderReceivedEmail = (vendorEmail, orderDetails, orderId) => {
  return new Promise((resolve, reject) => {
    if (!vendorEmail || !isValidEmail(vendorEmail)) {
      reject(new Error("Invalid vendor email address"));
      return;
    }

    const formattedOrderDetails = formatOrderDetails(orderDetails, orderId);

    const mail = {
      from: process.env.EMAIL_USER,
      to: vendorEmail,
      subject: "New Order Received",
      html: `
        <link rel="stylesheet" href="styles.css">
        <table width="600" cellpadding="20" cellspacing="0" style="font-family: Arial, sans-serif; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; background-color: #141414; color: #f9f9f9;">
          <tr>
            <td>
              <h2 class="glow" style="color: #7c3aed;">New Order Received</h2>
              <p>Dear Vendor,</p>
              ${formattedOrderDetails}
              <p>Please prepare the order for delivery.</p>
              <p>Best regards,</p>
              <p>Foodles Team</p>
            </td>
          </tr>
        </table>
      `,
    };

    contactEmail.sendMail(mail, (error, info) => {
      if (error) {
        console.error("Vendor email error:", error);
        reject(error);
      } else if (info.rejected.length > 0) {
        console.error(`Email rejected for vendor ${vendorEmail}`);
        reject(new Error("Vendor email delivery failed"));
      } else {
        console.log(`Email delivered successfully to vendor at ${vendorEmail}`);
        resolve(true);
      }
    });
  });
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Log the Razorpay key and secret to ensure they are being read correctly
console.log('Razorpay Key ID:', process.env.RAZORPAY_KEY_ID);
console.log('Razorpay Key Secret:', process.env.RAZORPAY_KEY_SECRET);

app.post('/payment/create-order', async (req, res) => {
  const { amount, currency = 'INR' } = req.body;
  
  try {
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount specified');
    }

    const options = {
      amount: Math.round(amount * 100),
      currency,
      receipt: `order_${Date.now()}`,
      notes: {
        description: "Foodles order payment",
        timestamp: new Date().toISOString()
      }
    };

    const order = await razorpay.orders.create(options);
    res.json({
      ...order,
      success: true
    });
  } catch (error) {
    console.error('Payment creation failed:', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/payment/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, name, email, orderDetails, orderId, vendorEmail } = req.body;

  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const payment_verified = generated_signature === razorpay_signature;

  // Send immediate response for payment verification
  res.json({ verified: payment_verified });

  // Process emails asynchronously after sending response
  if (payment_verified) {
    const parsedOrderDetails = JSON.parse(orderDetails);
    processEmails(name, email, parsedOrderDetails, orderId, vendorEmail);
  }
});

// Add new endpoint to check email status
app.get('/email-status/:orderId', async (req, res) => {
  const { orderId } = req.params;
  // Return the current email status for this order
  res.json({
    emailsSent: global.emailStatus?.[orderId]?.emailsSent || 0,
    emailErrors: global.emailStatus?.[orderId]?.emailErrors || []
  });
});

// Modify processEmails function to store status
async function processEmails(name, email, orderDetails, orderId, vendorEmail) {
  let emailsSent = 0;
  let emailErrors = [];

  try {
    // Initialize global status tracking
    global.emailStatus = global.emailStatus || {};
    global.emailStatus[orderId] = { emailsSent: 0, emailErrors: [] };

    // Send customer email
    try {
      await sendOrderConfirmationEmail(name, email, orderDetails, orderId);
      emailsSent++;
      console.log(`EMAIL SENT (${emailsSent}): Customer confirmation delivered`);
    } catch (error) {
      emailErrors.push({ type: 'customer', error: error.message });
    }

    // Send vendor email if provided
    if (vendorEmail) {
      try {
        await sendOrderReceivedEmail(vendorEmail, orderDetails, orderId);
        emailsSent++;
        console.log(`EMAIL SENT (${emailsSent}): Vendor notification delivered`);
      } catch (error) {
        emailErrors.push({ type: 'vendor', error: error.message });
      }
    }

    // Update global status after each email
    global.emailStatus[orderId] = { emailsSent, emailErrors };
  } catch (error) {
    console.error('Error in email sending process:', error);
  }
}

// Add more detailed logging for the health endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  const status = {
    status: 'OK',
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    services: {
      email: contactEmail ? 'connected' : 'error',
      razorpay: razorpay ? 'connected' : 'error'
    }
  };
  console.log('Health status:', status);
  res.json(status);
});

const PORT = process.env.PORT || 5000; // Changed port number to 5002
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
