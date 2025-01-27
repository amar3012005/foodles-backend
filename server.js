require('dotenv').config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

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
        <td style="text-align: right;">#AS_${orderId}</td>
      </tr>
    </table>
  `;
};

const sendOrderConfirmationEmail = (name, email, orderDetails, orderId) => {
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

  contactEmail.sendMail(mail, (error) => {
    if (error) {
      console.error("Contact email error:", error);
    } else {
      console.log(`Email sent successfully to ${email}`);
    }
  });
};

const sendOrderReceivedEmail = (vendorEmail, orderDetails, orderId) => {
  if (!vendorEmail) {
    console.error("Vendor email is not defined");
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

  contactEmail.sendMail(mail, (error) => {
    if (error) {
      console.error("Vendor email error:", error);
    } else {
      console.log(`Email sent successfully to vendor at ${vendorEmail}`);
    }
  });
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post('/payment/create-order', async (req, res) => {
  const { amount, currency = 'INR' } = req.body;
  
  try {
    const options = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency,
      receipt: `order_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/payment/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, name, email, orderDetails, orderId, vendorEmail } = req.body;

  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const payment_verified = generated_signature === razorpay_signature;

  if (payment_verified) {
    // Update order status to 'paid' in your database
    // Example: await Order.update({ status: 'paid' }, { where: { order_id: razorpay_order_id } });

    // Send order confirmation email to user
    sendOrderConfirmationEmail(name, email, JSON.parse(orderDetails), orderId);

    // Send order received email to vendor
    sendOrderReceivedEmail(vendorEmail, JSON.parse(orderDetails), orderId);
  }

  res.json({ verified: payment_verified });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));