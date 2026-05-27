const jwt = require('jsonwebtoken');
const pool = require('../db');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Check user suspension status and auto-expiry
    const userRes = await pool.query('SELECT account_status, suspended_until FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length > 0) {
      const dbUser = userRes.rows[0];
      if (dbUser.account_status === 'Suspended') {
        if (dbUser.suspended_until && new Date(dbUser.suspended_until) <= new Date()) {
          // Suspension has expired! Auto-restore user.
          await pool.query("UPDATE users SET account_status = 'Active', suspended_until = NULL WHERE id = $1", [decoded.id]);
          
          // Log expiry restoration into suspension history
          await pool.query(
            `INSERT INTO suspension_history (target_type, target_id, action, reason)
             VALUES ($1, $2, $3, $4)`,
            ['user', decoded.id, 'expire', 'Temporary suspension expired automatically']
          );

          // Create notification
          const notifTitle = "Account Access Restored";
          const notifMessage = "Your student account suspension has expired and access has been restored automatically.";
          await pool.query(
            `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [decoded.id, notifTitle, notifMessage, 'user', decoded.id, 'ACTIVE']
          );

          // WebSocket notify if possible
          const io = req.app.get('io');
          if (io) {
            io.to(`user_${decoded.id}`).emit('new_general_notification', {
              type: 'general_notification',
              title: notifTitle,
              message: notifMessage,
              created_at: new Date().toISOString()
            });
            io.to(`user_${decoded.id}`).emit('user_restored');
          }
        } else {
          // Still suspended. Block all state-modifying write operations (POST, PUT, DELETE, PATCH)
          if (req.method !== 'GET') {
            return res.status(403).json({
              success: false,
              message: 'Your account is suspended and this action is blocked.',
              isSuspended: true,
              suspendedUntil: dbUser.suspended_until
            });
          }
        }
      }
    }

    next();
  } catch (error) {
    res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }
};

module.exports = { verifyToken, isAdmin };
