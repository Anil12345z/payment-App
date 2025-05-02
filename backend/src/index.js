require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const nodemailer = require('nodemailer');

// Normalize WebsiteUrl by removing trailing slash
const WEBSITE_URL = (process.env.WebsiteUrl || 'http://localhost:3001').replace(/\/+$/, '');

const app = express();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your_secure_jwt_secret';

// Initialize Razorpay instances
const razorpayInstances = {
  test: new Razorpay({
    key_id: process.env.RAZORPAY_TEST_KEY_ID,
    key_secret: process.env.RAZORPAY_TEST_KEY_SECRET,
  }),
  live: new Razorpay({
    key_id: process.env.RAZORPAY_LIVE_KEY_ID,
    key_secret: process.env.RAZORPAY_LIVE_KEY_SECRET,
  }),
};

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // your email
    pass: process.env.EMAIL_PASS, // Gmail App Password
  },
});

// CORS configuration with a whitelist
const allowedOrigins = [WEBSITE_URL];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if the origin is in the whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // If origin is not allowed, return an error
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Middleware to verify JWT
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Sanitize input
const sanitizeInput = (input) => {
  return input.replace(/[<>{}]/g, '');
};

// Validate UPI ID
const validateUpiId = (upiId) => {
  return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/.test(upiId);
};

// User Signup
app.post('/signup', async (req, res) => {
  const { email, password, phone, name } = req.body;
  if (!email || !password || !phone || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const sanitizedName = sanitizeInput(name);
  const hashedPassword = await bcrypt.hash(password, 10);
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const upiId = `${email.split('@')[0]}-${randomSuffix}@cryptopay`;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        phone,
        name: sanitizedName,
        wallet: { create: { testingBalance: 0, testBalance: 0, realBalance: 0 } },
        upiId,
      },
    });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, email, upiId: user.upiId, name: sanitizedName } });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Email or UPI ID already exists' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email not found' });
    }
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, email, upiId: user.upiId, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Add Money to Testing Wallet
app.post('/add-testing-money', authenticate, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          amount,
          type: 'CREDIT',
          status: 'COMPLETED',
          wallet: { connect: { userId: req.userId } },
          description: 'Added to Testing Wallet (Test Mode)',
        },
      }),
      prisma.wallet.update({
        where: { userId: req.userId },
        data: { testingBalance: { increment: amount } },
      }),
    ]);
    res.json({ message: 'Money added to Testing Wallet successfully' });
  } catch (error) {
    console.error('Add testing money error:', error);
    res.status(500).json({ error: 'Failed to add money to Testing Wallet' });
  }
});

// Transfer Money from Testing Wallet
app.post('/transfer-testing', authenticate, async (req, res) => {
  const { amount, recipientUpiId } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (!recipientUpiId || !recipientUpiId.includes('@cryptopay')) {
    return res.status(400).json({ error: 'Invalid CryptoPay UPI ID' });
  }
  const sanitizedUpiId = sanitizeInput(recipientUpiId);
  try {
    const recipient = await prisma.user.findUnique({ where: { upiId: sanitizedUpiId } });
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
    const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (senderWallet.testingBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });
    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: req.userId },
        data: { testingBalance: { decrement: amount } },
      }),
      prisma.wallet.update({
        where: { userId: recipient.id },
        data: { testingBalance: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          amount,
          type: 'DEBIT',
          status: 'COMPLETED',
          wallet: { connect: { userId: req.userId } },
          description: `Transfer to ${sanitizedUpiId} (testing)`,
        },
      }),
      prisma.transaction.create({
        data: {
          amount,
          type: 'CREDIT',
          status: 'COMPLETED',
          wallet: { connect: { userId: recipient.id } },
          description: `Received from user ${req.userId} (testing)`,
        },
      }),
    ]);
    res.json({ message: 'Transfer successful' });
  } catch (error) {
    console.error('Testing transfer error:', error);
    res.status(500).json({ error: 'Transfer failed', details: error.message });
  }
});

// Transfer Money from Razorpay Real Wallet (Live UPI)
app.post('/transfer-real', authenticate, async (req, res) => {
  const { amount, recipientUpiId } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (!recipientUpiId || !validateUpiId(recipientUpiId)) {
    return res.status(400).json({ error: 'Invalid UPI ID format' });
  }
  const sanitizedUpiId = sanitizeInput(recipientUpiId);
  try {
    const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
    if (senderWallet.realBalance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const razorpay = razorpayInstances.live;
    if (!razorpay) {
      throw new Error('Razorpay live credentials not configured');
    }

    // Check if recipient is internal (@cryptopay)
    const recipient = await prisma.user.findUnique({ where: { upiId: sanitizedUpiId } });
    if (recipient) {
      // Internal transfer: update database directly
      await prisma.$transaction([
        prisma.wallet.update({
          where: { userId: req.userId },
          data: { realBalance: { decrement: amount } },
        }),
        prisma.wallet.update({
          where: { userId: recipient.id },
          data: { realBalance: { increment: amount } },
        }),
        prisma.transaction.create({
          data: {
            amount,
            type: 'DEBIT',
            status: 'COMPLETED',
            wallet: { connect: { userId: req.userId } },
            description: `Transfer to ${sanitizedUpiId} via Razorpay (live)`,
          },
        }),
        prisma.transaction.create({
          data: {
            amount,
            type: 'CREDIT',
            status: 'COMPLETED',
            wallet: { connect: { userId: recipient.id } },
            description: `Received from user ${req.userId} via Razorpay (live)`,
          },
        }),
      ]);
    } else {
      // External UPI transfer: use Razorpay live API
      const payment = await razorpay.payments.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency: 'INR',
        method: 'upi',
        vpa: sanitizedUpiId,
      });
      if (payment.status !== 'captured') {
        throw new Error('Payment not captured');
      }
      await prisma.$transaction([
        prisma.wallet.update({
          where: { userId: req.userId },
          data: { realBalance: { decrement: amount } },
        }),
        prisma.transaction.create({
          data: {
            amount,
            type: 'DEBIT',
            status: 'COMPLETED',
            wallet: { connect: { userId: req.userId } },
            description: `Transfer to ${sanitizedUpiId} via Razorpay (live)`,
            razorpayPaymentId: payment.id,
          },
        }),
      ]);
    }
    res.json({ message: 'Real UPI transfer successful' });
  } catch (error) {
    console.error('Real UPI transfer error:', error);
    res.status(500).json({ error: 'Real UPI transfer failed', details: error.message });
  }
});

// Create Razorpay Order
app.post('/create-order', authenticate, async (req, res) => {
  const { amount, type, mode } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (!['test', 'live'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  try {
    const razorpay = razorpayInstances[mode];
    if (!razorpay) {
      throw new Error(`Razorpay ${mode} credentials not configured`);
    }
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `receipt_${crypto.randomBytes(8).toString('hex')}`,
      payment_capture: 1, // Auto-capture payment
      notes: { type, mode },
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: mode === 'test' ? process.env.RAZORPAY_TEST_KEY_ID : process.env.RAZORPAY_LIVE_KEY_ID,
      mode,
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// Verify Razorpay Payment
app.post('/verify-payment', authenticate, async (req, res) => {
  const { orderId, paymentId, signature, amount, type, recipientUpiId, mode } = req.body;
  const sanitizedUpiId = recipientUpiId ? sanitizeInput(recipientUpiId) : undefined;
  const razorpayKeySecret = mode === 'test' ? process.env.RAZORPAY_TEST_KEY_SECRET : process.env.RAZORPAY_LIVE_KEY_SECRET;
  const generatedSignature = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (generatedSignature !== signature) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }
  try {
    const balanceField = mode === 'test' ? 'testBalance' : 'realBalance';
    if (type === 'ADD_MONEY') {
      await prisma.$transaction([
        prisma.transaction.create({
          data: {
            amount,
            type: 'CREDIT',
            status: 'COMPLETED',
            wallet: { connect: { userId: req.userId } },
            description: `Added from bank via Razorpay (${mode})`,
            razorpayPaymentId: paymentId,
          },
        }),
        prisma.wallet.update({
          where: { userId: req.userId },
          data: { [balanceField]: { increment: amount } },
        }),
      ]);
      res.json({ message: 'Money added successfully' });
    } else if (type === 'TRANSFER') {
      if (!sanitizedUpiId) return res.status(400).json({ error: 'Recipient UPI ID required' });
      const recipient = await prisma.user.findUnique({ where: { upiId: sanitizedUpiId } });
      if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
      const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
      if (senderWallet[balanceField] < amount) return res.status(400).json({ error: 'Insufficient balance' });
      await prisma.$transaction([
        prisma.wallet.update({
          where: { userId: req.userId },
          data: { [balanceField]: { decrement: amount } },
        }),
        prisma.wallet.update({
          where: { userId: recipient.id },
          data: { [balanceField]: { increment: amount } },
        }),
        prisma.transaction.create({
          data: {
            amount,
            type: 'DEBIT',
            status: 'COMPLETED',
            wallet: { connect: { userId: req.userId } },
            description: `Transfer to ${sanitizedUpiId} via Razorpay (${mode})`,
            razorpayPaymentId: paymentId,
          },
        }),
        prisma.transaction.create({
          data: {
            amount,
            type: 'CREDIT',
            status: 'COMPLETED',
            wallet: { connect: { userId: recipient.id } },
            description: `Received from user ${req.userId} via Razorpay (${mode})`,
            razorpayPaymentId: paymentId,
          },
        }),
      ]);
      res.json({ message: 'Transfer successful' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment processing failed', details: error.message });
  }
});

// Merchant Registration
app.post('/merchant/register', authenticate, async (req, res) => {
  const { businessName } = req.body;
  if (!businessName) return res.status(400).json({ error: 'Business name is required' });
  try {
    const merchant = await prisma.merchant.create({
      data: {
        businessName: sanitizeInput(businessName),
        user: { connect: { id: req.userId } },
        qrCode: await QRCode.toDataURL(`merchant:${req.userId}`),
      },
    });
    res.json({ merchant });
  } catch (error) {
    console.error('Merchant registration error:', error);
    res.status(400).json({ error: 'Merchant registration failed' });
  }
});

// Pay Merchant via QR or UPI
app.post('/pay-merchant', authenticate, async (req, res) => {
  const { merchantId, amount, mode } = req.body;
  if (!merchantId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid merchant ID or amount' });
  if (!['testing', 'test', 'live'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
  const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.userId } });
  const balanceField = mode === 'testing' ? 'testingBalance' : mode === 'test' ? 'testBalance' : 'realBalance';
  if (senderWallet[balanceField] < amount) return res.status(400).json({ error: 'Insufficient balance' });
  try {
    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: req.userId },
        data: { [balanceField]: { decrement: amount } },
      }),
      prisma.wallet.update({
        where: { userId: merchant.userId },
        data: { [balanceField]: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          amount,
          type: 'DEBIT',
          status: 'COMPLETED',
          wallet: { connect: { userId: req.userId } },
          description: `Payment to merchant ${merchant.businessName} (${mode})`,
        },
      }),
      prisma.transaction.create({
        data: {
          amount,
          type: 'CREDIT',
          status: 'COMPLETED',
          wallet: { connect: { userId: merchant.userId } },
          description: `Received from user ${req.userId} (${mode})`,
        },
      }),
    ]);
    res.json({ message: 'Payment successful' });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// Get Wallet Balance and Transactions
app.get('/wallet', authenticate, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.userId },
      include: { transactions: true, user: true },
    });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json(wallet);
  } catch (error) {
    console.error('Wallet fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch wallet', details: error.message });
  }
});

// Get Transaction History
app.get('/transactions', authenticate, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { wallet: { userId: req.userId } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(transactions);
  } catch (error) {
    console.error('Transaction history error:', error.message);
    res.status(500).json({ error: 'Failed to fetch transaction history', details: error.message });
  }
});

// Generate QR Code for Wallet
app.get('/wallet/qr', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const sanitizedName = encodeURIComponent(sanitizeInput(user.name));
    const upiUrl = `upi://pay?pa=${user.upiId}&pn=${sanitizedName}&cu=INR`;
    const qrCode = await QRCode.toDataURL(upiUrl);
    res.json({ qrCode, upiId: user.upiId, name: user.name });
  } catch (error) {
    console.error('QR code error:', error.message);
    res.status(500).json({ error: 'Failed to generate QR code', details: error.message });
  }
});

// Contact Form Endpoint
app.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;

  // Validate inputs
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!isValidEmail) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  const safeName = sanitizeInput(capitalizedName);
  const safeEmail = sanitizeInput(email);
  const safeMessage = sanitizeInput(message);

  const mailToAdmin = {
    from: safeEmail,
    to: process.env.EMAIL_USER,
    subject: 'New Contact Form Message - CryptoPay',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Message</title>
        <style>
          @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Poppins', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
          <tr>
            <td align="center" style="padding: 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 15px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(90deg, #5e2ced, #a44ed4); border-top-left-radius: 15px; border-top-right-radius: 15px; text-align: center;">
                    <h1 style="color: #ffffff; font-size: 25px; animation: fadeIn 1s ease-in-out;">CryptoPay</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 30px; text-align: left;">
                    <h2 style="color: #5e2ced; font-size: 24px; margin-bottom: 20px; animation: fadeIn 1s ease-in-out;">New Contact Message</h2>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="font-size: 16px; color: #333; margin: 0; animation: fadeIn 1s ease-in-out 0.3s;">
                            <strong style="color: #5e2ced;">Name:</strong> ${safeName}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="font-size: 16px; color: #333; margin: 0; animation: fadeIn 1s ease-in-out 0.5s;">
                            <strong style="color: #5e2ced;">Email:</strong> 
                            <a href="mailto:${safeEmail}" style="color: #5e2ced; text-decoration: none;">${safeEmail}</a>
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 15px;">
                          <p style="font-size: 16px; color: #333; margin: 0; animation: fadeIn 1s ease-in-out 0.7s;">
                            <strong style="color: #5e2ced;">Message:</strong>
                          </p>
                          <p style="font-size: 16px; color: #666; line-height: 1.6; background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 0; animation: fadeIn 1s ease-in-out 0.9s;">
                            ${safeMessage}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Call to Action -->
                <tr>
                  <td style="text-align: center; padding: 20px;">
                    <a href="mailto:${safeEmail}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(90deg, #5e2ced, #a44ed4); color: white; border-radius: 25px; text-decoration: none; font-size: 16px; font-weight: 600; animation: pulse 2s infinite;">
                      Reply to ${safeName}
                    </a>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background: #f5f5f5; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; text-align: center; padding: 20px;">
                    <p style="font-size: 14px; color: #666; margin: 0;">
                      Sent from <a href="${WEBSITE_URL}" style="color: #5e2ced; text-decoration: none;">CryptoPay</a> | 
                      <a href="${WEBSITE_URL}/contact" style="color: #5e2ced; text-decoration: none;">Contact Us</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  const mailToUser = {
    from: process.env.EMAIL_USER,
    to: safeEmail,
    subject: 'We Received Your Message! - CryptoPay',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>We Received Your Message</title>
        <style>
          @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(10px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Poppins', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
          <tr>
            <td align="center" style="padding: 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 15px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(90deg, #5e2ced, #a44ed4); border-top-left-radius: 15px; border-top-right-radius: 15px; text-align: center;">
                     <h1 style="color: #ffffff; font-size: 25px; animation: fadeIn 1s ease-in-out;">CryptoPay</h1>
                  </td>
                </tr>
                <!-- Confirmation Message -->
                <tr>
                  <td style="padding: 30px; text-align: left;">
                    <h2 style="color: #5e2ced; font-size: 18px; margin-bottom: 20px; animation: fadeIn 1s ease-in-out;">Hi ${safeName},</h2>
                    <p style="font-size: 16px; color: #333; line-height: 1.6; margin-bottom: 20px; animation: fadeIn 1s ease-in-out 0.3s;">
                      Thank you for visiting the CryptoPay and reaching out to us! We have received your message and will respond to you soon.
                    </p>
                    <p style="font-size: 16px; color: #333; line-height: 1.6; margin-bottom: 20px; animation: fadeIn 1s ease-in-out 0.5s;">
                      We’re excited to have you on board!
                    </p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 16px; color: #333; margin-bottom: 10px; animation: fadeIn 1s ease-in-out 0.7s;">
                      <em>Your message:</em>
                    </p>
                    <p style="font-size: 16px; color: #666; line-height: 1.6; background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 0; animation: fadeIn 1s ease-in-out 0.9s;">
                      ${safeMessage}
                    </p>
                  </td>
                </tr>
                <!-- Home Page Content -->
                <tr>
                  <td style="padding: 0 30px 30px; text-align: center;">
                    <p style="font-size: 16px; color: #666; margin-bottom: 20px; animation: fadeIn 1s ease-in-out 0.3s;">
                      A secure, fast, and easy-to-use UPI payment platform.
                    </p>
                    <img src="${WEBSITE_URL}/assets/payment.jpg" alt="Payment Illustration" style="max-width: 100%; height: auto; border-radius: 10px; margin-bottom: 20px; animation: fadeIn 1s ease-in-out 0.5s;" />
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                      <tr>
                        <td style="padding: 10px; background-color: #f9f9f9; border-radius: 10px; margin-bottom: 15px; animation: fadeIn 1s ease-in-out 0.7s;">
                          <h2 style="color: #5e2ced; font-size: 20px; margin-bottom: 10px;">Instant UPI Payments</h2>
                          <p style="font-size: 14px; color: #666; margin: 0;">Pay via UPI apps like PhonePe, Paytm, or Google Pay using QR codes.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; background-color: #f9f9f9; border-radius: 10px; margin-bottom: 15px; animation: fadeIn 1s ease-in-out 0.9s;">
                          <h2 style="color: #5e2ced; font-size: 20px; margin-bottom: 10px;">Secure Transactions</h2>
                          <p style="font-size: 14px; color: #666; margin: 0;">Your payments are protected with top-notch security.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; background-color: #f9f9f9; border-radius: 10px; margin-bottom: 15px; animation: fadeIn 1s ease-in-out 1.1s;">
                          <h2 style="color: #5e2ced; font-size: 20px; margin-bottom: 10px;">Transaction History</h2>
                          <p style="font-size: 14px; color: #666; margin: 0;">Track all your payments in one place.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; background-color: #f9f9f9; border-radius: 10px; margin-bottom: 15px; animation: fadeIn 1s ease-in-out 1.1s;">
                          <h2 style="color: #5e2ced; font-size: 20px; margin-bottom: 10px;">Wallet facility</h2>
                          <p style="font-size: 14px; color: #666; margin: 0;">Add money in your wallet from your Bank Account.</p>
                        </td>
                      </tr>
                    </table>
                    <a href="${WEBSITE_URL}/login" style="display: inline-block; padding: 12px 30px; background: linear-gradient(90deg, #5e2ced, #a44ed4); color: white; border-radius: 25px; text-decoration: none; font-size: 16px; font-weight: 600; animation: pulse 2s infinite;">
                      Get Started
                    </a>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background: #f5f5f5; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; text-align: center; padding: 20px;">
                    <p style="font-size: 14px; color: #666; margin: 0;">
                      Sent from <a href="${WEBSITE_URL}" style="color: #5e2ced; text-decoration: none;">CryptoPay</a> | 
                      <a href="${WEBSITE_URL}/contact" style="color: #5e2ced; text-decoration: none;">Contact Us</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  try {
    await emailTransporter.sendMail(mailToAdmin);
    await emailTransporter.sendMail(mailToUser);
    return res.status(200).json({ message: 'Emails sent successfully.' });
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({ error: 'Failed to send email.', details: error.message });
  }
});

app.listen(4000, () => console.log('Server running on port 4000'));
