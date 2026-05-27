const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// ─── Shared slot definitions ────────────────────────────────────────────────
const PREDEFINED_SLOTS = [
  '09:00 AM - 11:00 AM',
  '11:00 AM - 01:00 PM',
  '01:00 PM - 03:00 PM',
  '03:00 PM - 05:00 PM',
  '05:00 PM - 07:00 PM',
];

// ─── GET /api/orders/service/:id/booked-slots ────────────────────────────────
// Returns only ACCEPTED slots for a specific service on a given date
router.get('/service/:id/booked-slots', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const result = await pool.query(
      `SELECT booking_slot FROM orders
       WHERE item_type = 'service'
         AND item_id = $1
         AND booking_date = $2::date
         AND status = 'Accepted'`,
      [id, date]
    );

    const bookedSlots = result.rows.map(r => r.booking_slot);
    res.json({ success: true, bookedSlots });
  } catch (error) {
    console.error('Error fetching booked slots:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// ─── GET /api/orders/skill/:id/booked-slots ──────────────────────────────────
// Returns only ACCEPTED slots for a specific skill on a given date
router.get('/skill/:id/booked-slots', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const result = await pool.query(
      `SELECT booking_slot FROM orders
       WHERE item_type = 'skill'
         AND item_id = $1
         AND booking_date = $2::date
         AND status = 'Accepted'`,
      [id, date]
    );

    const bookedSlots = result.rows.map(r => r.booking_slot);
    res.json({ success: true, bookedSlots });
  } catch (error) {
    console.error('Error fetching booked slots:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// ─── POST /api/orders ────────────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      buyerId, sellerId, itemType, itemId,
      quantity, selectedPlanType, selectedPrice,
      bookingDate, bookingSlot
    } = req.body;

    if (!buyerId || !sellerId || !itemType || !itemId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Validate service booking fields
    if (itemType === 'service') {
      if (!bookingDate || !bookingSlot) {
        return res.status(400).json({ success: false, message: 'bookingDate and bookingSlot are required for service bookings' });
      }

      // Reject past dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const picked = new Date(bookingDate);
      if (picked < today) {
        return res.status(400).json({ success: false, message: 'Cannot book a slot on a past date' });
      }

      // Validate slot is one of the predefined ones
      if (!PREDEFINED_SLOTS.includes(bookingSlot)) {
        return res.status(400).json({ success: false, message: 'Invalid time slot selected' });
      }
    }

    // Validate skill booking fields
    if (itemType === 'skill') {
      if (!bookingDate || !bookingSlot) {
        return res.status(400).json({ success: false, message: 'bookingDate and bookingSlot are required for skill session requests' });
      }

      // Reject past dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const picked = new Date(bookingDate);
      if (picked < today) {
        return res.status(400).json({ success: false, message: 'Cannot book a slot on a past date' });
      }

      // Validate slot is one of the skill's available slots or predefined fallback
      const skillRes = await client.query('SELECT available_time_slot FROM skills WHERE id = $1', [itemId]);
      if (skillRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Skill not found' });
      }
      const dbSlotStr = skillRes.rows[0].available_time_slot;
      const allowedSlots = dbSlotStr ? dbSlotStr.split(', ') : PREDEFINED_SLOTS;
      if (!allowedSlots.includes(bookingSlot)) {
        return res.status(400).json({ success: false, message: 'Invalid time slot selected' });
      }
    }

    const requestedQuantity = quantity ? parseInt(quantity, 10) : 1;

    await client.query('BEGIN');

    // Product inventory check (not for services)
    if (itemType === 'product') {
      const inventoryRes = await client.query(
        'SELECT available_quantity FROM inventory WHERE item_type = $1 AND item_id = $2 FOR UPDATE',
        [itemType, itemId]
      );

      if (inventoryRes.rows.length === 0) throw new Error('Item not found in inventory');

      const availableQuantity = inventoryRes.rows[0].available_quantity;
      if (availableQuantity < requestedQuantity) throw new Error('Not enough stock available');
    }

    // Service: prevent duplicate Pending/Accepted booking for same slot
    if (itemType === 'service' && bookingDate && bookingSlot) {
      const dupCheck = await client.query(
        `SELECT id FROM orders
         WHERE item_type = 'service'
           AND item_id = $1
           AND booking_date = $2::date
           AND booking_slot = $3
           AND status IN ('Accepted', 'Pending')`,
        [itemId, bookingDate, bookingSlot]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'This time slot is already booked or has a pending request. Please choose another slot.' });
      }
    }

    // Skill: prevent duplicate Pending/Accepted booking for same slot
    if (itemType === 'skill' && bookingDate && bookingSlot) {
      const dupCheck = await client.query(
        `SELECT id FROM orders
         WHERE item_type = 'skill'
           AND item_id = $1
           AND booking_date = $2::date
           AND booking_slot = $3
           AND status IN ('Accepted', 'Pending')`,
        [itemId, bookingDate, bookingSlot]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'This time slot is already booked or has a pending request. Please choose another slot.' });
      }
    }

    // Create order record
    const result = await client.query(
      `INSERT INTO orders
         (buyer_id, seller_id, item_type, item_id, status, quantity,
          selected_plan_type, selected_price, booking_date, booking_slot,
          learning_goal, preferred_schedule, user_skill_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        buyerId, sellerId, itemType, itemId, 'Pending', requestedQuantity,
        selectedPlanType || null, selectedPrice || null,
        (itemType === 'service' || itemType === 'skill') ? bookingDate : null,
        (itemType === 'service' || itemType === 'skill') ? bookingSlot : null,
        itemType === 'skill' ? (req.body.learningGoal || null) : null,
        itemType === 'skill' ? (req.body.preferredSchedule || null) : null,
        itemType === 'skill' ? (req.body.userSkillLevel || null) : null
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, order: result.rows[0], message: 'Order request sent successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', error);
    if (error.message === 'Not enough stock available' || error.message === 'Item not found in inventory') {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Server Error' });
    }
  } finally {
    client.release();
  }
});

// ─── GET /api/orders/buyer/:id ───────────────────────────────────────────────
router.get('/buyer/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT o.id, o.buyer_id, o.seller_id, o.item_type, o.item_id, o.status, o.created_at, o.updated_at, o.quantity,
              o.selected_plan_type, o.selected_price, o.rejection_reason,
              o.booking_date, o.booking_slot, o.learning_goal, o.preferred_schedule, o.user_skill_level,
              u.first_name as seller_first_name, u.last_name as seller_last_name, u.profile_image as seller_profile_image
       FROM orders o
       JOIN users u ON o.seller_id = u.id
       WHERE o.buyer_id = $1 AND o.seller_id != $1
       ORDER BY o.updated_at DESC`,
      [id]
    );

    const orders = result.rows;
    if (orders.length === 0) return res.json({ success: true, orders: [] });

    const notifyRes = await pool.query(
      'SELECT product_id FROM notify_requests WHERE user_id = $1',
      [id]
    );
    const notifiedProductIds = new Set(notifyRes.rows.map(r => r.product_id));

    const populatedOrders = await populateOrderDetails(orders);
    const finalOrders = populatedOrders.map(order => ({
      ...order,
      hasRequestedNotification: order.item_type === 'product' && notifiedProductIds.has(order.item_id)
    }));

    res.json({ success: true, orders: finalOrders });
  } catch (error) {
    console.error('Error fetching buyer orders:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// ─── GET /api/orders/seller/:id ──────────────────────────────────────────────
router.get('/seller/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT o.id, o.buyer_id, o.seller_id, o.item_type, o.item_id, o.status, o.created_at, o.updated_at, o.quantity,
              o.selected_plan_type, o.selected_price, o.rejection_reason,
              o.booking_date, o.booking_slot, o.learning_goal, o.preferred_schedule, o.user_skill_level,
              u.first_name as buyer_first_name, u.last_name as buyer_last_name, u.profile_image as buyer_profile_image
       FROM orders o
       JOIN users u ON o.buyer_id = u.id
       WHERE o.seller_id = $1 AND o.buyer_id != $1
       ORDER BY o.updated_at DESC`,
      [id]
    );

    const orders = result.rows;
    if (orders.length === 0) return res.json({ success: true, orders: [] });

    const populatedOrders = await populateOrderDetails(orders);
    res.json({ success: true, orders: populatedOrders });
  } catch (error) {
    console.error('Error fetching seller orders:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// ─── PUT /api/orders/:id/status ──────────────────────────────────────────────
router.put('/:id/status', verifyToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    await client.query('BEGIN');

    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = orderRes.rows[0];

    if (status === 'Accepted' && order.status === 'Pending') {

      if (order.item_type === 'service' || order.item_type === 'skill') {
        // ── Service / Skill bookings use slot-based logic, NOT inventory ──────

        // Guard: ensure slot is still free (no other Accepted order for same service/skill/date/slot)
        if (order.booking_date && order.booking_slot) {
          const slotConflict = await client.query(
            `SELECT id FROM orders
             WHERE item_type = $1
               AND item_id = $2
               AND booking_date = $3
               AND booking_slot = $4
               AND status = 'Accepted'
               AND id != $5`,
            [order.item_type, order.item_id, order.booking_date, order.booking_slot, id]
          );
          if (slotConflict.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: 'This slot was already accepted for another request. Please reject this one.'
            });
          }

          // Auto-reject other Pending requests for the exact same service/skill/date/slot
          await client.query(
            `UPDATE orders
             SET status = 'Rejected',
                 rejection_reason = 'Slot already booked',
                 updated_at = CURRENT_TIMESTAMP
             WHERE item_type = $1
               AND item_id = $2
               AND booking_date = $3
               AND booking_slot = $4
               AND status = 'Pending'
               AND id != $5`,
            [order.item_type, order.item_id, order.booking_date, order.booking_slot, id]
          );
        }

        // Services/Skills remain Active — no inventory deduction, no status toggle

      } else {
        // ── Products use the existing inventory logic ──────────────────────────
        await client.query(
          `INSERT INTO inventory (item_type, item_id, available_quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (item_type, item_id) DO NOTHING`,
          [order.item_type, order.item_id, 1]
        );

        const invRes = await client.query(
          'SELECT available_quantity FROM inventory WHERE item_type = $1 AND item_id = $2 FOR UPDATE',
          [order.item_type, order.item_id]
        );

        if (invRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Inventory record not found' });
        }

        const currentQty = invRes.rows[0].available_quantity;
        const requestedQty = order.item_type === 'product' ? (order.quantity || 1) : 1;

        if (currentQty < requestedQty) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Insufficient stock/slots to accept this ${order.item_type}` });
        }

        const updateInvRes = await client.query(
          'UPDATE inventory SET available_quantity = available_quantity - $1 WHERE item_type = $2 AND item_id = $3 RETURNING available_quantity',
          [requestedQty, order.item_type, order.item_id]
        );

        const remainingQty = updateInvRes.rows[0].available_quantity;

        if (order.item_type === 'product') {
          await client.query(
            'UPDATE products SET quantity = quantity - $1 WHERE id = $2',
            [requestedQty, order.item_id]
          );
        }

        if (remainingQty === 0) {
          if (order.item_type === 'product') {
            await client.query("UPDATE products SET status = 'Sold' WHERE id = $1", [order.item_id]);
          }

          // Auto-cancel other pending requests for same product
          if (order.item_type === 'product') {
            await client.query(
              `UPDATE orders SET status = 'Rejected', rejection_reason = 'Sold Out', updated_at = CURRENT_TIMESTAMP
               WHERE item_id = $1 AND item_type = $2 AND status = 'Pending' AND id != $3`,
              [order.item_id, order.item_type, id]
            );
          }
        }
      }
    }

    let rejectionReasonToSave = req.body.rejectionReason || null;
    if (status === 'Rejected' && !rejectionReasonToSave) {
      if (order.item_type === 'product') {
        const prodRes = await client.query('SELECT quantity, status FROM products WHERE id = $1', [order.item_id]);
        if (prodRes.rows.length > 0) {
          const prod = prodRes.rows[0];
          if (prod.quantity === 0 || prod.status === 'Sold') {
            rejectionReasonToSave = 'Sold Out';
          }
        }
      }
    }

    const result = await client.query(
      'UPDATE orders SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [status, rejectionReasonToSave, id]
    );

    let newNotifResult = null;
    let systemMsgResult = null;

    if (status === 'Accepted') {
      // 1. Create or reuse chat session
      const existingChat = await client.query('SELECT chat_id FROM chats WHERE order_id = $1', [id]);
      let chatId;
      if (existingChat.rows.length > 0) {
        chatId = existingChat.rows[0].chat_id;
      } else {
        const chatInsert = await client.query(
          'INSERT INTO chats (order_id, buyer_id, seller_id, status) VALUES ($1, $2, $3, $4) RETURNING *',
          [id, order.buyer_id, order.seller_id, 'Active']
        );
        chatId = chatInsert.rows[0].chat_id;
      }

      // 2. Send default system message: "Your order request has been accepted."
      const existingMsg = await client.query(
        'SELECT message_id FROM messages WHERE chat_id = $1 AND sender_id = $2 AND message_text = $3',
        [chatId, order.seller_id, 'Your order request has been accepted.']
      );
      if (existingMsg.rows.length === 0) {
        const msgInsert = await client.query(
          'INSERT INTO messages (chat_id, sender_id, message_text) VALUES ($1, $2, $3) RETURNING *',
          [chatId, order.seller_id, 'Your order request has been accepted.']
        );
        systemMsgResult = msgInsert.rows[0];
      }

      // 3. Generate a notification for the buyer
      let itemTitle = 'Item';
      if (order.item_type === 'product') {
        const itemRes = await client.query('SELECT title FROM products WHERE id = $1', [order.item_id]);
        if (itemRes.rows.length > 0) itemTitle = itemRes.rows[0].title;
      } else if (order.item_type === 'skill') {
        const itemRes = await client.query('SELECT title FROM skills WHERE id = $1', [order.item_id]);
        if (itemRes.rows.length > 0) itemTitle = itemRes.rows[0].title;
      } else if (order.item_type === 'service') {
        const itemRes = await client.query('SELECT title FROM services WHERE id = $1', [order.item_id]);
        if (itemRes.rows.length > 0) itemTitle = itemRes.rows[0].title;
      }

      const notifTitle = 'Order Request Accepted';
      const notifMessage = `Your request for "${itemTitle}" has been accepted by the seller.`;
      const notifInsert = await client.query(
        `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [order.buyer_id, notifTitle, notifMessage, order.item_type, order.item_id, 'ACTIVE']
      );
      newNotifResult = notifInsert.rows[0];
    }

    await client.query('COMMIT');

    // Socket.io broadcasts after committing transaction
    if (status === 'Accepted') {
      const io = req.app.get('io');
      if (io) {
        if (systemMsgResult) {
          const sellerInfoRes = await pool.query('SELECT first_name, last_name, profile_image FROM users WHERE id = $1', [order.seller_id]);
          const sellerInfo = sellerInfoRes.rows[0] || {};
          io.to(`user_${order.buyer_id}`).to(`user_${order.seller_id}`).emit('new_message', {
            ...systemMsgResult,
            first_name: sellerInfo.first_name,
            last_name: sellerInfo.last_name,
            profile_image: sellerInfo.profile_image
          });
        }
        if (newNotifResult) {
          io.to(`user_${order.buyer_id}`).emit('new_general_notification', {
            id: `general-${newNotifResult.id}`,
            type: 'general_notification',
            title: newNotifResult.title,
            message: newNotifResult.message,
            item_type: order.item_type,
            item_id: order.item_id,
            status: 'ACTIVE',
            created_at: newNotifResult.created_at
          });
        }
      }
    }

    res.json({ success: true, order: result.rows[0], message: `Order status updated to ${status}` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    client.release();
  }
});

// ─── POST /api/orders/:id/cancel ─────────────────────────────────────────────
router.post('/:id/cancel', verifyToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRes.rows[0];

    if (order.status === 'Cancelled' || order.status === 'Completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled in its current state' });
    }

    await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['Cancelled', id]);

    // Restore inventory ONLY if previously Accepted AND NOT a service or skill (both are slot-based)
    if (order.status === 'Accepted' && order.item_type !== 'service' && order.item_type !== 'skill') {
      await client.query(
        `INSERT INTO inventory (item_type, item_id, available_quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (item_type, item_id) DO NOTHING`,
        [order.item_type, order.item_id, 0]
      );

      const quantityToRestore = order.item_type === 'product' ? (order.quantity || 1) : 1;

      const invUpdateRes = await client.query(
        'UPDATE inventory SET available_quantity = available_quantity + $1 WHERE item_type = $2 AND item_id = $3 RETURNING available_quantity',
        [quantityToRestore, order.item_type, order.item_id]
      );

      if (invUpdateRes.rows.length > 0) {
        const newQty = invUpdateRes.rows[0].available_quantity;
        if (order.item_type === 'product') {
          await client.query(
            'UPDATE products SET quantity = quantity + $1 WHERE id = $2',
            [quantityToRestore, order.item_id]
          );
        }
        if (newQty > 0) {
          if (order.item_type === 'product') {
            await client.query("UPDATE products SET status = 'Available' WHERE id = $1", [order.item_id]);
          } else if (order.item_type === 'skill') {
            await client.query("UPDATE skills SET status = 'Active' WHERE id = $1", [order.item_id]);
          }
        }
      }
    }
    // For services: cancelling an Accepted booking simply frees up the slot automatically
    // (the slot availability check queries only 'Accepted' orders)

    const chatUpdateRes = await client.query(
      'UPDATE chats SET status = $1 WHERE order_id = $2 RETURNING chat_id, buyer_id, seller_id',
      ['Cancelled', id]
    );

    await client.query('COMMIT');

    if (chatUpdateRes.rows.length > 0) {
      const { chat_id: chatId, buyer_id: buyerId, seller_id: sellerId } = chatUpdateRes.rows[0];
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${buyerId}`).to(`user_${sellerId}`).emit('chat_cancelled', { chatId, orderId: id });
      }
    }

    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  } finally {
    client.release();
  }
});

// ─── Helper: populate item details ───────────────────────────────────────────
async function populateOrderDetails(orders) {
  const productIds = orders.filter(o => o.item_type === 'product').map(o => o.item_id);
  const skillIds   = orders.filter(o => o.item_type === 'skill').map(o => o.item_id);
  const serviceIds = orders.filter(o => o.item_type === 'service').map(o => o.item_id);

  let products = [];
  if (productIds.length > 0) {
    const pRes = await pool.query('SELECT * FROM products WHERE id = ANY($1::int[])', [productIds]);
    products = pRes.rows;
  }

  let skills = [];
  if (skillIds.length > 0) {
    const sRes = await pool.query('SELECT * FROM skills WHERE id = ANY($1::int[])', [skillIds]);
    skills = sRes.rows;
  }

  let services = [];
  if (serviceIds.length > 0) {
    const srvRes = await pool.query('SELECT * FROM services WHERE id = ANY($1::int[])', [serviceIds]);
    services = srvRes.rows;
  }

  return orders.map(order => {
    let itemDetails = {};
    if (order.item_type === 'product') {
      itemDetails = products.find(p => p.id === order.item_id) || {};
    } else if (order.item_type === 'skill') {
      itemDetails = skills.find(s => s.id === order.item_id) || {};
    } else if (order.item_type === 'service') {
      itemDetails = services.find(s => s.id === order.item_id) || {};
    }

    return {
      ...order,
      itemTitle:   itemDetails?.title || 'Unknown Item',
      itemPrice:   order.selected_price || itemDetails?.price || itemDetails?.hourly_rate || itemDetails?.standard_plan || 'N/A',
      itemImage:   itemDetails?.image_urls && itemDetails.image_urls.length > 0 ? itemDetails.image_urls[0] : null,
      category:    itemDetails?.category || itemDetails?.service_type || 'General',
      booking_date: order.booking_date || null,
      booking_slot: order.booking_slot || null,
    };
  });
}

module.exports = router;
