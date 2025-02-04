require('dotenv').config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
const http = require("http");
const twilio = require('twilio');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server first
const server = http.createServer(app);

// Then create WebSocket server


const isDevelopment = process.env.NODE_ENV !== 'development';

// Update CORS configuration for Render deployment
app.use(cors({
  origin: [
    'https://foodles.shop',
    'https://www.foodles.shop',
    'https://precious-cobbler-d60f77.netlify.app', // If using Netlify for frontend
    ''                 // Keep local development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin']
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log('📨 Request:', {
    origin: req.get('origin'),
    method: req.method,
    path: req.path,
    host: req.get('host'),
    environment: process.env.NODE_ENV,
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
  // Format phone numbers consistently
  const formatPhoneForDisplay = (phone) => {
    if (!phone) return 'Not provided';
    const cleaned = phone.replace(/^\+?(91)?/, '').replace(/\D/g, '');
    return `+91 ${cleaned}`;
  };

  const prePaidAmount = parseFloat(orderDetails.remainingPayment) || 0;
  const remainingAmount = orderDetails.grandTotal - prePaidAmount;

  // Format phone numbers for links
  const vendorPhoneLink = orderDetails.vendorPhone ? 
    formatPhoneNumber(orderDetails.vendorPhone) : '';
  const customerPhoneLink = orderDetails.customerPhone ? 
    formatPhoneNumber(orderDetails.customerPhone) : '';

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
        <tr style="background-color:rgb(146, 146, 146);">
          <td colspan="2" style="padding: 10px 5px; color: #000000; font-weight: bold;">Total</td>
          <td style="text-align: right; padding: 10px 5px; color: #000000; font-weight: bold;">₹${orderDetails.grandTotal.toFixed(2)}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; border-top: 1px solid #333333; padding-top: 15px;">
        <h3 style="color: #FFD700; font-size: 16px; margin-bottom: 10px;">PAYMENT DETAILS</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="background-color: #1A1A1A;">
            <td style="padding: 10px 5px; color: #4ADE80;">Order-Confirmation Amount (paid)</td>
            <td style="text-align: right; padding: 10px 5px; color: #4ADE80;">
              ₹${prePaidAmount.toFixed(2)}
            </td>
          </tr>
          <tr style="background-color: #FFD700;">
            <td style="padding: 10px 5px; color: #000000;">Pay on Delivery</td>
            <td style="text-align: right; padding: 10px 5px; color: #000000;">
              ₹${remainingAmount.toFixed(2)}
            </td>
          </tr>
        </table>
      </div>

      <div style="background-color: #1A1A1A; padding: 15px; margin-bottom: 20px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">DELIVERY LOCATION</h3>
        <p style="margin: 0; color: #ffffff;">${orderDetails.deliveryAddress}</p>
      </div>

      <div style="background-color: #1A1A1A; padding: 15px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">VENDOR CONTACT</h3>
        <p style="margin: 0; color: #ffffff;">
          Mobile: <a href="tel:${vendorPhoneLink}" style="color: #4ADE80; text-decoration: none; border-bottom: 1px dashed #4ADE80;">
            ${formatPhoneForDisplay(orderDetails.vendorPhone)}
          </a>
        </p>
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
      <h1 style="color: #FFD700; margin: 0; font-size: 24px;">NEW ORDER_${orderId} RECEIVED</h1>
      <p style="color: #888888; margin: 5px 0;">Order ID: #${orderId}</p>
    </div>

    <div style="background-color: #111111; padding: 20px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="border-bottom: 1px solid #333333;">
          <th style="text-align: left; padding: 10px 5px; color: #888888;">Item</th>
          <th style="text-align: center; padding: 10px 5px; color: #888888;">Qty</th>

        </tr>
        ${orderDetails.items.map(item => `
          <tr style="border-bottom: 1px solid #222222;">
            <td style="padding: 10px 5px;">${item.name}</td>
            <td style="text-align: center; padding: 10px 5px;">${item.quantity}</td>
          </tr>
        `).join('')}
        <tr style="background-color:rgb(250, 231, 124);">
          <td colspan="2" style="padding: 10px 5px; color:black ; font-weight: bold;">Total Amount</td>
          <td style="text-align: right; padding: 10px 5px; color: black; font-weight: bold;">₹${remainingAmount.toFixed(2)}</td>
        </tr>
      </table>



      <div style="background-color: #1A1A1A; padding: 15px; margin-bottom: 20px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">DELIVERY LOCATION</h3>
        <p style="margin: 0; color: #ffffff;">${orderDetails.deliveryAddress}</p>
      </div>

      <div style="background-color: #1A1A1A; padding: 15px;">
        <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 16px;">CUSTOMER CONTACT</h3>
        <p style="margin: 0; color: #ffffff;">
          Mobile: <a href="tel:${customerPhoneLink}" style="color: #4ADE80; text-decoration: none; border-bottom: 1px dashed #4ADE80;">
            ${formatPhoneForDisplay(orderDetails.customerPhone)}
          </a>
        </p>
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
    vendorPhone,
    restaurantId,
    restaurantName 
  } = req.body;

  console.log('Payment verification details:', {
    orderId,
    vendorEmail,
    vendorPhone,
    restaurantId,
    restaurantName,
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
      const finalVendorPhone = formatPhoneNumber(vendorPhone || parsedOrderDetails.vendorPhone);
      if (parsedOrderDetails.customerPhone) {
        parsedOrderDetails.customerPhone = formatPhoneNumber(parsedOrderDetails.customerPhone);
      }
      
      console.log('Processing order with vendor phone:', finalVendorPhone);
      
      await processEmails(name, email, parsedOrderDetails, orderId, vendorEmail, finalVendorPhone, restaurantId);
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
async function processEmails(name, email, orderDetails, orderId, vendorEmail, vendorPhone, restaurantId) {
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
          console.log(`📞 Initiating vendor missed call:`, {
            restaurantId,
            phone: vendorPhone,
            hasConfig: !!twilioClients[restaurantId]
          });
          
          const callSuccess = await triggerMissedCall(vendorPhone, restaurantId);
          missedCallStatus = callSuccess ? 'success' : 'failed';
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

// Update Twilio configuration manager with dynamic loading from .env
const twilioConfigs = {
  '1': {  // BABA_JI FOOD-POINT
    accountSid: process.env.TWILIO_ACCOUNT_SID_1,
    authToken: process.env.TWILIO_AUTH_TOKEN_1,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER_1
  },
  '2': {  // HIMALAYAN_CAFE
    accountSid: process.env.TWILIO_ACCOUNT_SID_2,
    authToken: process.env.TWILIO_AUTH_TOKEN_2,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER_2
  },
  '3': {  // SONU_FOOD-POINT
    accountSid: process.env.TWILIO_ACCOUNT_SID_3,
    authToken: process.env.TWILIO_AUTH_TOKEN_3,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER_3
  },
  '4': {  // JEEVA_FOOD-POINT
    accountSid: process.env.TWILIO_ACCOUNT_SID_4,
    authToken: process.env.TWILIO_AUTH_TOKEN_4,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER_4
  },
  '5': {  // PIZZA-BITE
    accountSid: process.env.TWILIO_ACCOUNT_SID_5,
    authToken: process.env.TWILIO_AUTH_TOKEN_5,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER_5
  }
};

// Initialize Twilio clients for each restaurant
const twilioClients = {};

Object.entries(twilioConfigs).forEach(([restaurantId, config]) => {
  if (config.accountSid && config.authToken) {
    twilioClients[restaurantId] = {
      client: twilio(config.accountSid, config.authToken),
      phone: config.phoneNumber
    };
    console.log(`✓ Twilio initialized for Restaurant ${restaurantId}`);
  } else {
    console.log(`⚠️ Missing Twilio credentials for Restaurant ${restaurantId}`);
  }
});

console.log('Available Twilio configurations:', Object.keys(twilioClients));

// Add helper function for phone number formatting
const formatPhoneNumber = (phone) => {
  const cleaned = phone.replace(/^\+?(91)?/, '').replace(/\D/g, '');
  return cleaned ? `+91${cleaned}` : '';
};

// Remove all duplicate triggerMissedCall functions and replace with this one
const triggerMissedCall = async (vendorPhone, restaurantId) => {
  console.log('\n🔄 Starting missed call process:', {
    restaurantId,
    vendorPhone,
    availableConfigs: Object.keys(twilioClients)
  });
  
  const twilioConfig = twilioClients[restaurantId];
  if (!twilioConfig?.client) {
    console.error('❌ No Twilio configuration found for restaurant:', restaurantId);
    return false;
  }

  try {
    const formattedPhone = formatPhoneNumber(vendorPhone);
    console.log(`📞 Restaurant ${restaurantId} call details:`, {
      from: twilioConfig.phone,
      to: formattedPhone,
      config: {
        sid: twilioConfig.client.accountSid,
        phone: twilioConfig.phone
      }
    });

    const call = await twilioConfig.client.calls.create({
      url: 'http://twimlets.com/reject',
      from: twilioConfig.phone,
      to: formattedPhone,
      timeout: 15
    });
    
    console.log('✅ Call created:', {
      sid: call.sid,
      status: call.status,
      restaurant: restaurantId,
      phone: formattedPhone
    });

    return true;
  } catch (error) {
    console.error('❌ Twilio error:', {
      restaurantId,
      code: error.code,
      message: error.message,
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

// Add restaurant status endpoints
const restaurantStatusCache = {
  lastCheck: null,
  statuses: {}
};

const getRestaurantStatus = (restaurantId) => {
  const now = new Date();
  const statusKey = `RESTAURANT_${restaurantId}_STATUS`;
  const status = process.env[statusKey];
  
  // Add detailed logging
  console.log(`Checking status for restaurant ${restaurantId}:`, {
    statusKey,
    status: status || 'not set',
    timestamp: now.toISOString(),
    allStatus: Object.keys(process.env)
      .filter(key => key.startsWith('RESTAURANT_'))
      .reduce((acc, key) => ({ ...acc, [key]: process.env[key] }), {})
  });

  return {
    isOpen: status === '1',
    message: status === '1' ? 'Open' : 'Temporarily Closed',
    lastChecked: now.toISOString(),
    restaurantId,
    debug: { rawStatus: status }
  };
};

app.get('/api/restaurants/status/:restaurantId', (req, res) => {
  const { restaurantId } = req.params;
  const status = getRestaurantStatus(restaurantId);
  res.json(status);
});

app.get('/api/restaurants/status', (req, res) => {
  const now = new Date();
  const statuses = {};
  
  // Get all restaurant IDs from query or use default list
  const ids = req.query.ids?.split(',') || ['1', '2', '3', '4', '5'];
  
  // Check if we need to refresh the cache (10 seconds)
  const shouldRefreshCache = !restaurantStatusCache.lastCheck || 
    (now - restaurantStatusCache.lastCheck) > 10000;

  if (shouldRefreshCache) {
    console.log('Refreshing restaurant status cache:', {
      timestamp: now.toISOString(),
      requestedIds: ids,
      previousCache: restaurantStatusCache
    });

    ids.forEach(id => {
      statuses[id] = getRestaurantStatus(id);
    });
    
    // Update cache
    restaurantStatusCache.statuses = statuses;
    restaurantStatusCache.lastCheck = now;
  }

  // Send response with metadata
  const response = {
    statuses: shouldRefreshCache ? statuses : restaurantStatusCache.statuses,
    metadata: {
      lastChecked: restaurantStatusCache.lastCheck,
      nextCheckAt: new Date(restaurantStatusCache.lastCheck + 10000).toISOString(),
      isFromCache: !shouldRefreshCache,
      debug: {
        currentTime: now.toISOString(),
        cacheAge: restaurantStatusCache.lastCheck ? 
          now - restaurantStatusCache.lastCheck : 
          null
      }
    }
  };

  console.log('Sending status response:', {
    fromCache: !shouldRefreshCache,
    restaurantCount: Object.keys(response.statuses).length,
    timestamp: now.toISOString()
  });

  res.json(response);
});

// Add new endpoint for restaurant selection logging
app.post('/api/log-restaurant-selection', (req, res) => {
  const { restaurantId, restaurantName, timestamp } = req.body;
  
  console.log('\n🏪 Restaurant Selected:', {
    restaurantId,
    restaurantName,
    timestamp
  });

  res.json({ success: true });
});

// Add status monitoring system
const statusMonitor = {
  watchers: new Set(),
  previousStatuses: {},
  checkInterval: null,

  startMonitoring() {
    this.checkInterval = setInterval(() => {
      const changes = this.checkForChanges();
      if (changes.length > 0) {
        this.notifyWatchers(changes);
      }
    }, 1000); // Check every second
  },

  checkForChanges() {
    const changes = [];
    const ids = ['1', '2', '3', '4', '5'];
    
    ids.forEach(id => {
      const statusKey = `RESTAURANT_${id}_STATUS`;
      const currentStatus = process.env[statusKey];
      
      if (this.previousStatuses[id] !== currentStatus) {
        changes.push({
          restaurantId: id,
          oldStatus: this.previousStatuses[id],
          newStatus: currentStatus,
          timestamp: new Date().toISOString()
        });
        this.previousStatuses[id] = currentStatus;
      }
    });
    
    return changes;
  },

  notifyWatchers(changes) {
    const message = JSON.stringify({ type: 'STATUS_UPDATE', changes });
    this.watchers.forEach(client => {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(message);
      }
    });
  }
};

// Initialize status monitor
statusMonitor.startMonitoring();

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handler
wss.on('connection', (ws) => {
  statusMonitor.watchers.add(ws);
  
  // Send initial statuses
  const initialStatus = Object.keys(process.env)
    .filter(key => key.startsWith('RESTAURANT_'))
    .reduce((acc, key) => {
      const id = key.split('_')[1];
      acc[id] = process.env[key];
      return acc;
    }, {});
  
  ws.send(JSON.stringify({ 
    type: 'INITIAL_STATUS', 
    statuses: initialStatus 
  }));

  ws.on('close', () => {
    statusMonitor.watchers.delete(ws);
  });
});

// Start the server
server.listen(PORT, () => {
  // Get status of Twilio configurations
  const twilioStatus = Object.entries(twilioClients)
    .map(([id, config]) => `Restaurant ${id}: ✓`)
    .join('\n   ');

  console.log(`
🚀 Server running in ${process.env.NODE_ENV} mode
📍 Port: ${PORT}
🌐 Allowed Origins:
   - https://foodles.shop
   - https://www.foodles.shop
   - https://precious-cobbler-d60f77.netlify.app
   - http://localhost:3000
📞 Twilio Status:
   ${twilioStatus || '✗ No restaurants configured'}
📧 Email: ${contactEmail ? '✓ Connected' : '✗ Not Connected'}
  `);
});

// Error handler for the server
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please kill any existing processes on port ${PORT} and try again.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});
