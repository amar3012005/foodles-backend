const express = require('express');
const twilio = require('twilio');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Twilio credentials (replace with your actual credentials)
const accountSid = 'AC7cc7a16e22f04b875e9c234f8ee51f7d';
const authToken = '59ae779b914963b734e0a0ca25179fba';
const twilioPhoneNumber = '+12569065502';

// Initialize Twilio client
const client = twilio(accountSid, authToken);

// SMS sending route
app.post('/send-sms', async (req, res) => {
  const { phoneNumber, message } = req.body;

  try {
    // Send SMS using Twilio
    const response = await client.messages.create({
      body: message,
      from: twilioPhoneNumber, // Your Twilio phone number
      to: phoneNumber,         // The recipient phone number
    });

    console.log('SMS sent:', response.sid);
    res.status(200).send('SMS sent successfully!');
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).send('Failed to send SMS');
  }
});

// Start server
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
