require('dotenv').config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
const http = require("http");
const twilio = require('twilio');

const app = express();

const isDevelopment = process.env.NODE_ENV !== 'development';

// Update CORS configuration for production
app.use(cors({
  origin: [
    'https://foodles.shop',
    'https://www.foodles.shop',
    'https://precious-cobbler-d60f77.netlify.app',
    'http://localhost:3000' // Keep local development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add production logging middleware
app.use((req, res, next) => {
  console.log('📨 Request:', {
    origin: req.get('origin'),
    method: req.method,
    path: req.path,
    host: req.get('host'),
    timestamp: new Date().toISOString()
  });
  next();
});

app.use(express.json());
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
  const userEmailTemplate = `
  <div style="background-color: #000000; color: #ffffff; font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #111111; border-left: 4px solid #FFD700; padding: 20px; margin-bottom: 20px;">
      <h1 style="color: #FFD700; margin: 0; font-size: 24px;">ORDER CONFIRMED</h1>
      <p style="color: #888888; margin: 5px 0;">Order ID: #${orderId}</p>
    </div>

    <div style="background-color: #111111; padding: 20px; margin-bottom: 20px;">
      <div style="border-bottom: 1px solid #333333; padding-bottom: 10px; margin-bottom: 15px;">
        <h2 style="color: #FFD700; font-size: 18px; margin: 0;">ORDER DETAILS</h2>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="border-bottom: 1px solid #333333;">
          <th style="text-align: left; padding: 10px 5px; color: #888888;">Item</th>
          <th style="text-align: center; padding: 10px 5px; color: #888888;">Qty</th>
          <th style="text-align: right; padding: 10px 5px; color: #888888;">Price</th>
        </tr>
        ${orderDetails.items.map(item => `
          <tr style="border-bottom: 1px solid #222222;">
            <td style="padding: 10px 5px;">${item.name}</td>
            <td style="text-align: center; padding: 10px 5px;">${item.quantity}</td>
            <td style="text-align: right; padding: 10px 5px;">₹${(item.price * item.quantity).toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr style="background-color: #1A1A1A;">
          <td colspan="2" style="padding: 10px 5px;">Subtotal</td>
          <td style="text-align: right; padding: 10px 5px;">₹${orderDetails.subtotal.toFixed(2)}</td>
        </tr>
        <tr style="background-color: #1A1A1A;">
          <td colspan="2" style="padding: 10px 5px;">Delivery Fee</td>
          <td style="text-align: right; padding: 10px 5px;">₹${orderDetails.deliveryFee.toFixed(2)}</td>
        </tr>
        <tr style="background-color: #1A1A1A;">
          <td colspan="2" style="padding: 10px 5px;">Convenience Fee</td>
          <td style="text-align: right; padding: 10px 5px;">₹${orderDetails.convenienceFee.toFixed(2)}</td>
        </tr>
        ${orderDetails.dogDonation > 0 ? `
          <tr style="background-color: #1A1A1A;">
            <td colspan="2" style="padding: 10px 5px;">Dog Donation</td>
            <td style="text-align: right; padding: 10px 5px;">₹${orderDetails.dogDonation.toFixed(2)}</td>
          </tr>
        ` : ''}
        <tr style="background-color: #FFD700;">
          <td colspan="2" style="padding: 10px 5px; color: #000000; font-weight: bold;">Total</td>
          <td style="text-align: right; padding: 10px 5px; color: #000000; font-weight: bold;">₹${orderDetails.grandTotal.toFixed(2)}</td>
        </tr>
      </table>

      <div style="background-color: #1A1A1A; padding: 15px; margin-bottom: 20px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">DELIVERY LOCATION</h3>
        <p style="margin: 0; color: #ffffff;">${orderDetails.deliveryAddress}</p>
      </div>

      <div style="background-color: #1A1A1A; padding: 15px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">VENDOR CONTACT</h3>
        <p style="margin: 0; color: #ffffff;">Mobile: ${orderDetails.vendorPhone || 'Not provided'}</p>
      </div>
    </div>

    <div style="text-align: center; padding: 20px; background-color: #111111;">
      <p style="color: #888888; margin: 0;">Thank you for ordering with Foodles</p>
    </div>
  </div>
  `;

  const vendorEmailTemplate = `
  <div style="background-color: #000000; color: #ffffff; font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #111111; border-left: 4px solid #FFD700; padding: 20px; margin-bottom: 20px;">
      <h1 style="color: #FFD700; margin: 0; font-size: 24px;">NEW ORDER RECEIVED</h1>
      <p style="color: #888888; margin: 5px 0;">Order ID: #${orderId}</p>
    </div>

    <div style="background-color: #111111; padding: 20px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="border-bottom: 1px solid #333333;">
          <th style="text-align: left; padding: 10px 5px; color: #888888;">Item</th>
          <th style="text-align: center; padding: 10px 5px; color: #888888;">Qty</th>
          <th style="text-align: right; padding: 10px 5px; color: #888888;">Price</th>
        </tr>
        ${orderDetails.items.map(item => `
          <tr style="border-bottom: 1px solid #222222;">
            <td style="padding: 10px 5px;">${item.name}</td>
            <td style="text-align: center; padding: 10px 5px;">${item.quantity}</td>
            <td style="text-align: right; padding: 10px 5px;">₹${(item.price * item.quantity).toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr style="background-color: #FFD700;">
          <td colspan="2" style="padding: 10px 5px; color: #000000; font-weight: bold;">Total Amount</td>
          <td style="text-align: right; padding: 10px 5px; color: #000000; font-weight: bold;">₹${orderDetails.grandTotal.toFixed(2)}</td>
        </tr>
      </table>

      <div style="background-color: #1A1A1A; padding: 15px; margin-bottom: 20px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">DELIVERY LOCATION</h3>
        <p style="margin: 0; color: #ffffff;">${orderDetails.deliveryAddress}</p>
      </div>

      <div style="background-color: #1A1A1A; padding: 15px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">CUSTOMER CONTACT</h3>
        <p style="margin: 0; color: #ffffff;">Mobile: ${orderDetails.customerPhone || 'Not provided'}</p>
      </div>
    </div>

    <div style="text-align: center; padding: 20px; background-color: #111111;">
      <p style="color: #888888; margin: 0;">Please prepare the order for delivery</p>
    </div>
  </div>
  `;

  return { userEmailTemplate, vendorEmailTemplate };
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const sendOrderConfirmationEmail = (name, email, orderDetails, orderId) => {
  return new Promise((resolve, reject) => {
    if (!isValidEmail(email)) {
      reject(new Error("Invalid customer email address"));
      return;
    }

    const { userEmailTemplate } = formatOrderDetails(orderDetails, orderId);

    const mail = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Order Confirmation - Foodles",
      html: userEmailTemplate
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
    if (!isValidEmail(vendorEmail)) {
      reject(new Error("Invalid vendor email address"));
      return;
    }

    const { vendorEmailTemplate } = formatOrderDetails(orderDetails, orderId);

    const mail = {
      from: process.env.EMAIL_USER,
      to: vendorEmail,
      subject: "New Order Received - Foodles",
      html: vendorEmailTemplate
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

// Rest of your existing code remains unchanged
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature, 
    name, 
    email, 
    orderDetails, 
    orderId, 
    vendorEmail, 
    vendorPhone 
  } = req.body;

  console.log('Payment verification details:', {
    orderId,
    vendorEmail,
    vendorPhone,
    hasOrderDetails: !!orderDetails
  });

  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const payment_verified = generated_signature === razorpay_signature;

  if (payment_verified) {
    try {
      const parsedOrderDetails = JSON.parse(orderDetails);
      // Ensure vendorPhone is passed from both places
      const finalVendorPhone = vendorPhone || parsedOrderDetails.vendorPhone;
      
      console.log('Processing order with vendor phone:', finalVendorPhone);
      
      await processEmails(name, email, parsedOrderDetails, orderId, vendorEmail, finalVendorPhone);
      res.json({ 
        verified: true,
        orderId,
        vendorNotified: !!finalVendorPhone
      });
    } catch (error) {
      console.error('Order processing error:', error);
      res.json({ verified: true, error: error.message });
    }
  } else {
    res.json({ verified: false });
  }
});

// Add new endpoint to check email status
app.get('/email-status/:orderId', async (req, res) => {
  const { orderId } = req.params;
  // Return the current email status for this order
  res.json({
    emailsSent: global.emailStatus?.[orderId]?.emailsSent || 0,
    emailErrors: global.emailStatus?.[orderId]?.emailErrors || [],
    missedCallStatus: global.emailStatus?.[orderId]?.missedCallStatus || null
  });
});

// Modify processEmails function to store status
async function processEmails(name, email, orderDetails, orderId, vendorEmail, vendorPhone) {
  let emailsSent = 0;
  let emailErrors = [];
  let missedCallStatus = null;

  try {
    console.log('\n📋 Processing order notifications:', { orderId, vendorPhone });
    global.emailStatus = global.emailStatus || {};
    global.emailStatus[orderId] = { emailsSent: 0, emailErrors: [], missedCallStatus: null };

    // Send customer email
    try {
      await sendOrderConfirmationEmail(name, email, orderDetails, orderId);
      emailsSent++;
      console.log(`📧 Customer email sent successfully to ${email}`);
    } catch (error) {
      console.error('❌ Customer email failed:', error.message);
      emailErrors.push({ type: 'customer', error: error.message });
    }

    // Send vendor notifications
    if (vendorEmail) {
      try {
        await sendOrderReceivedEmail(vendorEmail, orderDetails, orderId);
        emailsSent++;
        console.log(`📧 Vendor email sent successfully to ${vendorEmail}`);
        
        // Trigger missed call after vendor email success
        if (vendorPhone) {
          console.log(`📞 Initiating vendor missed call to ${vendorPhone}`);
          const callSuccess = await triggerMissedCall(vendorPhone);
          missedCallStatus = callSuccess ? 'success' : 'failed';
          console.log(`📱 Vendor notification status:`, {
            email: 'sent',
            missedCall: missedCallStatus,
            phone: vendorPhone
          });
        }
      } catch (error) {
        console.error('❌ Vendor notifications failed:', error.message);
        emailErrors.push({ type: 'vendor', error: error.message });
      }
    }

    // Update final status
    global.emailStatus[orderId] = { 
      emailsSent, 
      emailErrors, 
      missedCallStatus 
    };

    console.log('✅ Order notifications completed:', {
      orderId,
      emailsSent,
      missedCall: missedCallStatus
    });

  } catch (error) {
    console.error('❌ Notification process error:', error);
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

// Add after other configurations
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

// Add helper function for phone number formatting
const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned.startsWith('91')) {
    cleaned = '91' + cleaned;
  }
  return '+' + cleaned;
};

// Remove all duplicate triggerMissedCall functions and replace with this one
const triggerMissedCall = async (vendorPhone) => {
  console.log('\n🔄 Starting missed call process...');
  
  if (!twilioClient) {
    console.warn('⚠️ Twilio not configured:', {
      accountSid: !!process.env.TWILIO_ACCOUNT_SID,
      authToken: !!process.env.TWILIO_AUTH_TOKEN,
      phone: process.env.TWILIO_PHONE_NUMBER
    });
    return false;
  }

  try {
    const formattedPhone = formatPhoneNumber(vendorPhone);
    console.log(`📞 Call details:`, {
      from: twilioPhone,
      to: formattedPhone,
      url: 'http://twimlets.com/reject'
    });

    const call = await twilioClient.calls.create({
      url: 'http://twimlets.com/reject',
      from: twilioPhone,
      to: formattedPhone,
      timeout: 5,
      machineDetection: 'DetectMessageEnd'
    });
    
    console.log('✅ Call created:', {
      sid: call.sid,
      status: call.status,
      direction: call.direction
    });

    return true;
  } catch (error) {
    let errorMessage = 'Failed to make missed call';
    switch(error.code) {
      case 21614: errorMessage = 'Unverified number (trial account)'; break;
      case 21210:
      case 21211: errorMessage = 'Invalid phone format'; break;
      case 21217: errorMessage = 'Phone not verified'; break;
      default: errorMessage = error.message;
    }

    console.error('❌ Twilio error:', {
      code: error.code,
      message: errorMessage,
      phone: vendorPhone
    });
    return false;
  }
};

// Add test endpoint
app.post('/test-missed-call', async (req, res) => {
  console.log('📞 Test call request received:', req.body);
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number required' });
  }

  try {
    const result = await triggerMissedCall(phoneNumber);
    res.json({
      success: result,
      message: result ? 'Call initiated' : 'Call failed',
      phone: phoneNumber
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Remove all previous server startup code and replace with this
const PORT = process.env.PORT || 5000;

const startServer = () => {
  const server = app.listen(PORT, () => {
    console.log(`
🚀 Server running in ${process.env.NODE_ENV} mode
📍 Port: ${PORT}
🌐 Allowed Origins:
   - https://foodles.shop
   - https://www.foodles.shop
   - https://precious-cobbler-d60f77.netlify.app
   - http://localhost:3000
📞 Twilio: ${twilioClient ? '✓ Connected' : '✗ Not Configured'}
📧 Email: ${contactEmail ? '✓ Connected' : '✗ Not Connected'}
    `);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use. Please kill any existing processes on port ${PORT} and try again.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', error);
      process.exit(1);
    }
  });
};

// Start the server
startServer();
