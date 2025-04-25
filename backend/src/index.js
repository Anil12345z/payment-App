require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');

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

app.use(cors());
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

app.listen(4000, () => console.log('Server running on port 4000'));
