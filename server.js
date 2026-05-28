const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
dotenv.config();
const pool = require('./db');
const runMigrations = require('./utils/runMigrations');
const authRoutes = require('./routes/auth');
const listingsRoutes = require('./routes/listings');
const wishlistRoutes = require('./routes/wishlist');
const ordersRoutes = require('./routes/orders');
const chatRoutes = require('./routes/chats');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const searchRoutes = require('./routes/search');
const path = require('path');

// Sync and repair any mismatched item statuses on startup
async function syncDatabaseStatuses() {
  try {
    // Run auto-migrations first to ensure all tables & columns exist in remote Neon DB
    await runMigrations();

    console.log("Synchronizing item statuses and inventory...");
    // 1. For products: status should be 'Available' if available_quantity > 0
    await pool.query(`
      UPDATE products 
      SET status = 'Available' 
      WHERE id IN (
        SELECT item_id FROM inventory 
        WHERE item_type = 'product' AND available_quantity > 0
      ) AND status = 'Sold'
    `);

    // 2. For skills: status should be 'Active' if available_quantity > 0
    await pool.query(`
      UPDATE skills 
      SET status = 'Active' 
      WHERE id IN (
        SELECT item_id FROM inventory 
        WHERE item_type = 'skill' AND available_quantity > 0
      ) AND status = 'Inactive'
    `);

    // 3. For services: status should be 'Active' if available_quantity > 0
    await pool.query(`
      UPDATE services 
      SET status = 'Active' 
      WHERE id IN (
        SELECT item_id FROM inventory 
        WHERE item_type = 'service' AND available_quantity > 0
      ) AND status = 'Inactive'
    `);
    console.log("Database status synchronization complete.");
  } catch (error) {
    console.error("Failed to synchronize database statuses:", error);
  }
}
syncDatabaseStatuses();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy (required for Vercel/load balancers - fixes rate limiting & IP detection)
app.set('trust proxy', 1);

// Dynamic CORS Configuration
const allowedOrigins = [
  'https://talentnest-api.onrender.com',
  'https://talent-nest-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
if (process.env.FRONTEND_URL) {
  const cleanFrontendUrl = process.env.FRONTEND_URL.endsWith('/') 
    ? process.env.FRONTEND_URL.slice(0, -1) 
    : process.env.FRONTEND_URL;
  if (!allowedOrigins.includes(cleanFrontendUrl)) {
    allowedOrigins.push(cleanFrontendUrl);
  }
}

// Middleware
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);
app.use('/api/forgot-password', authLimiter);
app.use('/api/verify-otp', authLimiter);
app.use('/api/reset-password', authLimiter);

// Routes
app.use('/api', authRoutes);
app.use('/api', listingsRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/search', searchRoutes);

app.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    console.log('Root endpoint hit: Database connection is healthy.');
    res.json({
      success: true,
      message: 'Welcome to the TalentNest API!',
      database: 'Connected'
    });
  } catch (err) {
    console.error('Root endpoint hit error: Database connection failed:', err.message);
    res.status(500).json({
      success: false,
      message: 'Welcome to the TalentNest API!',
      database: 'Disconnected',
      error: err.message
    });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ success: true, message: 'pong' });
});

// Test Database Connection Route
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now, message: 'Database connection successful!' });
  } catch (error) {
    console.error('Database connection error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to connect to the database', error: error.message });
  }
});


const http = require('http');
const { Server } = require('socket.io');

// Socket.io + HTTP server only work outside Vercel serverless
if (!process.env.VERCEL) {
  const server = http.createServer(app);

  // Initialize Socket.io with the exact same CORS policy
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Store io instance on app for access in routes
  app.set('io', io);

  // Setup WebSocket handlers
  const setupSocket = require('./socket');
  setupSocket(io);

  // Start Server
  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`CORS policy strictly locked to: ${allowedOrigins.join(', ')}`);
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      pool.end().then(() => {
        console.log('Database pool closed.');
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Export for Vercel serverless
module.exports = app;