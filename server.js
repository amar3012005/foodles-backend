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

// Update triggerMissedCall function
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

// Update server startup logging
const startServer = () => {
  const server = app.listen(PORT, () => {
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
