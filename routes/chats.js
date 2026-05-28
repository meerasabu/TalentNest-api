const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/chats - Create a new chat for an order (or return existing)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { orderId, userId } = req.body;
    
    if (!orderId || !userId) {
      return res.status(400).json({ success: false, message: 'Missing orderId or userId' });
    }

    // Check if order exists and is Accepted
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRes.rows[0];
    if (order.status.toUpperCase() !== 'ACCEPTED' && order.status.toUpperCase() !== 'COMPLETED') {
      return res.status(403).json({ success: false, message: 'Chat is only available for accepted or completed orders.' });
    }

    // Verify the user is either the buyer or the seller
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized for this chat' });
    }

    // Check if chat already exists
    const existingChat = await pool.query('SELECT * FROM chats WHERE order_id = $1', [orderId]);
    if (existingChat.rows.length > 0) {
      return res.status(200).json({ success: true, chat: existingChat.rows[0] });
    }

    // Create new chat
    const result = await pool.query(
      'INSERT INTO chats (order_id, buyer_id, seller_id) VALUES ($1, $2, $3) RETURNING *',
      [orderId, order.buyer_id, order.seller_id]
    );

    res.status(201).json({ success: true, chat: result.rows[0] });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/chats/unread/count - Get unread message count for authenticated user
router.get('/unread/count', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
      SELECT COUNT(*) AS count
      FROM messages m
      JOIN chats c ON m.chat_id = c.chat_id
      WHERE (c.buyer_id = $1 OR c.seller_id = $1)
        AND m.sender_id != $1
        AND m.is_read = FALSE
    `, [userId]);
    res.status(200).json({ success: true, count: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/chats/chat/:chatId/read - Mark messages in a chat as read
router.post('/chat/:chatId/read', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    await pool.query(`
      UPDATE messages
      SET is_read = TRUE
      WHERE chat_id = $1 AND sender_id != $2 AND is_read = FALSE
    `, [chatId, userId]);

    // Broadcast the unread counts update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('messages_read', { chatId });
    }

    res.status(200).json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/chats/:userId - Get all active chats for a user
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Join with users table to get partner info, and orders to get item info
    const result = await pool.query(`
      SELECT 
        c.chat_id, c.order_id, c.created_at, c.status as chat_status, c.is_closed,
        o.item_type, o.item_id, o.status as order_status,
        o.selected_plan_type, o.selected_price,
        o.booking_date, o.booking_slot,
        o.learning_goal, o.preferred_schedule, o.user_skill_level,
        CASE 
          WHEN c.buyer_id = $1 THEN seller.id 
          ELSE buyer.id 
        END AS partner_id,
        CASE 
          WHEN c.buyer_id = $1 THEN seller.first_name || ' ' || seller.last_name
          ELSE buyer.first_name || ' ' || buyer.last_name
        END AS partner_name,
        CASE 
          WHEN c.buyer_id = $1 THEN seller.profile_image
          ELSE buyer.profile_image
        END AS partner_image
      FROM chats c
      JOIN orders o ON c.order_id = o.id
      JOIN users buyer ON c.buyer_id = buyer.id
      JOIN users seller ON c.seller_id = seller.id
      WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND (c.status IS NULL OR c.status != 'Restricted')
      ORDER BY c.created_at DESC
    `, [userId]);

    const chats = result.rows;


    // We also want to fetch the item title based on item_type and item_id
    // To avoid complex SQL logic, we'll fetch them in parallel JS
    const populatedChats = await Promise.all(chats.map(async (chat) => {
      let itemTitle = 'Unknown Item';
      const tableMap = { product: 'products', skill: 'skills', service: 'services' };
      const table = tableMap[chat.item_type];
      if (!table) return { ...chat, item_title: itemTitle };
      
      try {
        const itemRes = await pool.query(`SELECT title FROM ${table} WHERE id = $1`, [chat.item_id]);
        if (itemRes.rows.length > 0) {
          itemTitle = itemRes.rows[0].title;
        }
      } catch(e) {
        // Ignore missing items if deleted
      }

      return {
        ...chat,
        item_title: itemTitle
      };
    }));

    res.status(200).json({ success: true, chats: populatedChats });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/chats/chat/:chatId/messages - Get messages for a chat
router.get('/chat/:chatId/messages', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const result = await pool.query(
      'SELECT m.*, u.first_name, u.last_name, u.profile_image FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.chat_id = $1 ORDER BY m.created_at ASC',
      [chatId]
    );

    res.status(200).json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/chats/chat/:chatId/messages - Send a message
router.post('/chat/:chatId/messages', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;
    const senderId = req.user.id;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }

    // Verify chat exists
    const chatRes = await pool.query('SELECT * FROM chats WHERE chat_id = $1', [chatId]);
    if (chatRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Verify sender account status
    const senderRes = await pool.query('SELECT account_status, suspended_until FROM users WHERE id = $1', [senderId]);
    if (senderRes.rows.length > 0) {
      const sender = senderRes.rows[0];
      if (sender.account_status === 'Suspended') {
        if (!sender.suspended_until || new Date(sender.suspended_until) > new Date()) {
          return res.status(403).json({ success: false, message: 'Your messaging access has been suspended.' });
        } else {
          // Suspension expired, update status back to 'Active'
          await pool.query("UPDATE users SET account_status = 'Active', suspended_until = NULL WHERE id = $1", [senderId]);
        }
      }
    }

    // Verify chat status is not Restricted
    const chat = chatRes.rows[0];
    if (chat.status === 'Restricted') {
      return res.status(403).json({ success: false, message: 'This conversation has been restricted by an admin.' });
    }

    const result = await pool.query(
      'INSERT INTO messages (chat_id, sender_id, message_text) VALUES ($1, $2, $3) RETURNING *',
      [chatId, senderId, text]
    );

    // Fetch user info for the response
    const userRes = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [senderId]);
    
    const newMessage = {
      ...result.rows[0],
      first_name: userRes.rows[0]?.first_name,
      last_name: userRes.rows[0]?.last_name
    };

    res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/chats/:chatId/complete - Mark chat and order as completed
router.post('/:chatId/complete', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Get chat to find the order and participants
    const chatRes = await pool.query('SELECT order_id, buyer_id, seller_id FROM chats WHERE chat_id = $1', [chatId]);
    if (chatRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }
    const { order_id: orderId, buyer_id: buyerId, seller_id: sellerId } = chatRes.rows[0];

    // Update order status
    await pool.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['Completed', orderId]);
    
    // Update chat status
    await pool.query('UPDATE chats SET status = $1 WHERE chat_id = $2', ['Completed', chatId]);

    // Broadcast the update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${buyerId}`).to(`user_${sellerId}`).emit('chat_completed', { chatId, orderId });
    }

    res.status(200).json({ success: true, message: 'Marked as completed' });
  } catch (error) {
    console.error('Error completing chat:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/chats/report - Report a conversation
router.post('/report', verifyToken, async (req, res) => {
  try {
    const { reporterId, reportedId, reason, chatId, itemId, itemType } = req.body;
    
    if (!reporterId || !reportedId || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    await pool.query(
      `INSERT INTO reports (reporter_id, reported_id, reason, chat_id, item_id, item_type) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reporterId, reportedId, reason, chatId || null, itemId || null, itemType || null]
    );

    res.status(201).json({ success: true, message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Error submitting report:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/chats/user/:userId/partner/:partnerId/messages - Get all messages across all chats between two users
router.get('/user/:userId/partner/:partnerId/messages', verifyToken, async (req, res) => {
  try {
    const { userId, partnerId } = req.params;
    
    const result = await pool.query(`
      SELECT m.*, u.first_name, u.last_name, u.profile_image 
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      JOIN chats c ON m.chat_id = c.chat_id
      WHERE (c.buyer_id = $1 AND c.seller_id = $2) OR (c.buyer_id = $2 AND c.seller_id = $1)
      ORDER BY m.created_at ASC
    `, [userId, partnerId]);

    res.status(200).json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('Error fetching partner messages:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/chats/:chatId/close - Close/archive a chat session
router.post('/:chatId/close', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    await pool.query('UPDATE chats SET is_closed = TRUE WHERE chat_id = $1', [chatId]);
    res.status(200).json({ success: true, message: 'Session closed/archived successfully' });
  } catch (error) {
    console.error('Error closing session:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/chats/:chatId/reopen - Reopen/restore a chat session
router.post('/:chatId/reopen', verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    await pool.query('UPDATE chats SET is_closed = FALSE WHERE chat_id = $1', [chatId]);
    res.status(200).json({ success: true, message: 'Session restored successfully' });
  } catch (error) {
    console.error('Error reopening session:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
