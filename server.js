const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const pool = require('./db');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.get('/', (req, res) => {
  res.send('Welcome to the TalentNest API!');
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

// Wrap Express app in HTTP server for WebSocket integration
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
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
});
