const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.use(isAdmin);

// GET /api/admin/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    // 1. Total Students (users who are not admins)
    const studentsRes = await pool.query("SELECT COUNT(*) FROM users WHERE role != 'admin'");
    const totalStudents = parseInt(studentsRes.rows[0].count, 10);

    // 2. Active Listings (products + skills + services)
    const productsRes = await pool.query("SELECT COUNT(*) FROM products");
    const skillsRes = await pool.query("SELECT COUNT(*) FROM skills");
    const servicesRes = await pool.query("SELECT COUNT(*) FROM services");
    const activeListings = parseInt(productsRes.rows[0].count, 10) + 
                           parseInt(skillsRes.rows[0].count, 10) + 
                           parseInt(servicesRes.rows[0].count, 10);

    // 3. Ongoing Requests (Pending/Accepted orders)
    const requestsRes = await pool.query("SELECT COUNT(*) FROM orders WHERE status IN ('Pending', 'Accepted')");
    const ongoingRequests = parseInt(requestsRes.rows[0].count, 10);

    // 4. Pending Reports (Reports where status = 'Pending')
    // Fallback if the reports table or status column is missing
    let pendingReports = 0;
    try {
      const reportsRes = await pool.query("SELECT COUNT(*) FROM reports WHERE status = 'Pending'");
      pendingReports = parseInt(reportsRes.rows[0].count, 10);
    } catch (err) {
      console.error('Reports table query error:', err.message);
    }

    // 5. Pending Verifications (skills where status = 'Pending Verification')
    let pendingVerifications = 0;
    try {
      const verifRes = await pool.query("SELECT COUNT(*) FROM skills WHERE status = 'Pending Verification'");
      pendingVerifications = parseInt(verifRes.rows[0].count, 10);
    } catch (err) {
      console.error('Pending verifications query error:', err.message);
    }

    res.status(200).json({
      success: true,
      stats: {
        totalStudents,
        activeListings,
        ongoingRequests,
        pendingReports,
        pendingVerifications
      }
    });

  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/recent-activity - Fetch dynamic activity highlights
router.get('/recent-activity', async (req, res) => {
  try {
    // 1. Products (marketplace listings)
    const productsRes = await pool.query(`
      SELECT p.id, p.title, p.created_at, u.first_name, u.last_name 
      FROM products p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC 
      LIMIT 10
    `);

    // 2. Skills
    const skillsRes = await pool.query(`
      SELECT s.id, s.title, s.created_at, s.status, u.first_name, u.last_name 
      FROM skills s 
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC 
      LIMIT 10
    `);

    // 3. Orders
    const ordersRes = await pool.query(`
      SELECT o.id, o.created_at, o.item_type, o.status, 
             b.first_name as buyer_first_name, b.last_name as buyer_last_name,
             sl.first_name as seller_first_name, sl.last_name as seller_last_name,
             COALESCE(p.title, sk.title, sv.title, 'Unknown Item') as item_title
      FROM orders o
      JOIN users b ON o.buyer_id = b.id
      JOIN users sl ON o.seller_id = sl.id
      LEFT JOIN products p ON o.item_type = 'product' AND o.item_id = p.id
      LEFT JOIN skills sk ON o.item_type = 'skill' AND o.item_id = sk.id
      LEFT JOIN services sv ON o.item_type = 'service' AND o.item_id = sv.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // 4. Reports
    const reportsRes = await pool.query(`
      SELECT r.id, r.created_at, r.reason, u.first_name, u.last_name 
      FROM reports r 
      JOIN users u ON r.reporter_id = u.id 
      ORDER BY r.created_at DESC 
      LIMIT 10
    `);

    let activities = [];

    // Map Products
    productsRes.rows.forEach(p => {
      activities.push({
        id: `product-${p.id}`,
        type: 'product',
        title: `${p.first_name} added a marketplace item: ${p.title}`,
        time: p.created_at,
        route: `/admin/marketplace`
      });
    });

    // Map Skills
    skillsRes.rows.forEach(s => {
      if (s.status === 'Pending Verification') {
        activities.push({
          id: `verification-${s.id}`,
          type: 'verification',
          title: `New student verification request for skill: ${s.title}`,
          time: s.created_at,
          route: `/admin/verification`
        });
      } else {
        activities.push({
          id: `skill-${s.id}`,
          type: 'skill',
          title: `${s.first_name} published a tutoring skill: ${s.title}`,
          time: s.created_at,
          route: `/admin/skills`
        });
      }
    });

    // Map Orders
    ordersRes.rows.forEach(o => {
      let titleText = '';
      let route = '/admin/orders';
      if (o.status === 'Completed') {
        titleText = `${o.item_type.charAt(0).toUpperCase() + o.item_type.slice(1)} completed: ${o.item_title}`;
      } else {
        titleText = `New ${o.item_type} request for ${o.item_title} ordered by ${o.buyer_first_name}`;
      }
      activities.push({
        id: `order-${o.id}`,
        type: 'order',
        title: titleText,
        time: o.created_at,
        route: route
      });
    });

    // Map Reports
    reportsRes.rows.forEach(r => {
      activities.push({
        id: `report-${r.id}`,
        type: 'report',
        title: `Conversation/Content reported by ${r.first_name}`,
        time: r.created_at,
        route: `/admin/reports`
      });
    });

    // Sort by time descending
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Limit to 6 items
    activities = activities.slice(0, 6);

    res.status(200).json({ success: true, activities });
  } catch (error) {
    console.error('Error fetching admin recent activities:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/students - Fetch all students
router.get('/students', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, first_name, last_name, email, department, graduation_year, profile_image, account_status 
      FROM users 
      WHERE role != 'admin'
      ORDER BY first_name ASC
    `);
    res.status(200).json({ success: true, students: result.rows });
  } catch (error) {
    console.error('Error fetching admin students:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// PUT /api/admin/students/:id/status - Update student account status
router.put('/students/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await pool.query(
      'UPDATE users SET account_status = $1 WHERE id = $2',
      [status, id]
    );
    
    res.status(200).json({ success: true, message: `Account status updated to ${status}` });
  } catch (error) {
    console.error('Error updating student status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/students/:id - Fetch detailed student profile
router.get('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch basic user info
    const userRes = await pool.query(`
      SELECT id, first_name, last_name, email, department, graduation_year, profile_image, account_status, role, suspended_until
      FROM users WHERE id = $1
    `, [id]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const student = userRes.rows[0];

    // 2. Fetch activity stats
    const productsRes = await pool.query("SELECT COUNT(*) FROM products WHERE user_id = $1", [id]);
    const skillsRes = await pool.query("SELECT COUNT(*) FROM skills WHERE user_id = $1", [id]);
    const servicesRes = await pool.query("SELECT COUNT(*) FROM services WHERE user_id = $1", [id]);
    const ordersRes = await pool.query("SELECT COUNT(*) FROM orders WHERE buyer_id = $1 OR seller_id = $1", [id]);

    const stats = {
      marketplace: parseInt(productsRes.rows[0].count, 10),
      skills: parseInt(skillsRes.rows[0].count, 10),
      services: parseInt(servicesRes.rows[0].count, 10),
      orders: parseInt(ordersRes.rows[0].count, 10)
    };

    // 3. Fetch reports against this user
    const reportsRes = await pool.query(`
      SELECT r.*, u.first_name as reporter_name 
      FROM reports r 
      JOIN users u ON r.reporter_id = u.id 
      WHERE r.reported_id = $1 
      ORDER BY r.created_at DESC
    `, [id]);

    // 4. Fetch suspension history logs
    const suspensionRes = await pool.query(`
      SELECT sh.*, u.first_name as admin_first_name, u.last_name as admin_last_name 
      FROM suspension_history sh 
      LEFT JOIN users u ON sh.admin_id = u.id 
      WHERE sh.target_type = 'user' AND sh.target_id = $1 
      ORDER BY sh.created_at DESC
    `, [id]);

    res.status(200).json({
      success: true,
      student,
      stats,
      reports: reportsRes.rows,
      suspensionHistory: suspensionRes.rows
    });

  } catch (error) {
    console.error('Error fetching admin student detail:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/marketplace - Fetch all physical product listings
router.get('/marketplace', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.first_name, u.last_name 
      FROM products p 
      JOIN users u ON p.user_id = u.id 
      ORDER BY p.created_at DESC
    `);
    res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Error fetching admin marketplace:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// PUT /api/admin/marketplace/:id/status - Moderate product status
router.put('/marketplace/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.query('UPDATE products SET status = $1 WHERE id = $2', [status, id]);
    res.status(200).json({ success: true, message: `Product marked as ${status}` });
  } catch (error) {
    console.error('Error updating product status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// DELETE /api/admin/marketplace/:id - Remove product listing
router.delete('/marketplace/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Product listing removed' });
  } catch (error) {
    console.error('Error removing product listing:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/marketplace/:id - Fetch detailed product info
router.get('/marketplace/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT p.*, u.first_name, u.last_name, u.profile_image as seller_avatar, u.department as seller_dept
      FROM products p 
      JOIN users u ON p.user_id = u.id 
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('Error fetching admin product detail:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/marketplace/:id/warn-seller - Warn product seller with reason
router.post('/marketplace/:id/warn-seller', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Warning reason is required' });
    }

    // Fetch product and owner info
    const productRes = await pool.query(
      'SELECT p.user_id, p.title, u.first_name, u.last_name FROM products p JOIN users u ON p.user_id = u.id WHERE p.id = $1',
      [id]
    );
    if (productRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const product = productRes.rows[0];

    // 1. Log to warn_history
    await pool.query(
      `INSERT INTO warn_history (target_type, target_id, target_user_id, admin_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      ['product', id, product.user_id, adminId, reason.trim()]
    );

    // 2. Send notification to seller
    const notifTitle = 'Warning: Marketplace Listing';
    const notifMessage = `Your listing "${product.title}" has received a warning from the admin. Reason: ${reason.trim()}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [product.user_id, notifTitle, notifMessage, 'product', id, 'WARNING']
    );

    // 3. WebSocket broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${product.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Seller warned successfully' });
  } catch (error) {
    console.error('Error warning seller:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/marketplace/:id/restore - Restore an inappropriate product back to Available
router.post('/marketplace/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;

    const productRes = await pool.query('SELECT user_id, title FROM products WHERE id = $1', [id]);
    if (productRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const product = productRes.rows[0];

    await pool.query("UPDATE products SET status = 'Available' WHERE id = $1", [id]);

    // Notify seller
    const notifTitle = 'Listing Restored';
    const notifMessage = `Your marketplace listing "${product.title}" has been restored and is now available.`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [product.user_id, notifTitle, notifMessage, 'product', id, 'ACTIVE']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${product.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Product restored successfully' });
  } catch (error) {
    console.error('Error restoring product:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/marketplace/:id/warn-history - Get warning history for a product
router.get('/marketplace/:id/warn-history', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT wh.*, u.first_name as admin_first_name, u.last_name as admin_last_name
       FROM warn_history wh
       LEFT JOIN users u ON wh.admin_id = u.id
       WHERE wh.target_type = 'product' AND wh.target_id = $1
       ORDER BY wh.created_at DESC`,
      [id]
    );
    res.status(200).json({ success: true, warnHistory: result.rows });
  } catch (error) {
    console.error('Error fetching warn history:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/skills - Fetch all skills for moderation
router.get('/skills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.first_name, u.last_name 
      FROM skills s 
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    res.status(200).json({ success: true, skills: result.rows });
  } catch (error) {
    console.error('Error fetching admin skills:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// PUT /api/admin/skills/:id/status - Update skill status
router.put('/skills/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    // Fetch owner and title for notification
    const skillRes = await pool.query('SELECT user_id, title FROM skills WHERE id = $1', [id]);
    if (skillRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    const skill = skillRes.rows[0];
    const ownerId = skill.user_id;
    const skillTitle = skill.title;

    await pool.query(
      'UPDATE skills SET status = $1, rejection_reason = $2 WHERE id = $3',
      [status, status === 'Rejected' ? rejectionReason : null, id]
    );

    const notifTitle = status === 'Active' ? 'Skill Session Approved' : 'Skill Session Rejected';
    const notifMessage = status === 'Active'
      ? `Your skill listing "${skillTitle}" has been approved and published successfully!`
      : `Your skill listing "${skillTitle}" was rejected.`;

    const insertNotifRes = await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status, rejection_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        ownerId,
        notifTitle,
        notifMessage,
        'skill',
        id,
        status === 'Active' ? 'APPROVED' : 'REJECTED',
        status === 'Rejected' ? rejectionReason : null
      ]
    );
    const newNotif = insertNotifRes.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${ownerId}`).emit('new_general_notification', {
        id: `general-${newNotif.id}`,
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        item_type: 'skill',
        item_id: id,
        status: status === 'Active' ? 'APPROVED' : 'REJECTED',
        rejection_reason: status === 'Rejected' ? rejectionReason : null,
        created_at: newNotif.created_at
      });
    }

    res.status(200).json({ success: true, message: `Skill status updated to ${status}` });
  } catch (error) {
    console.error('Error updating skill status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/services - Fetch all services for moderation
router.get('/services', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.first_name, u.last_name 
      FROM services s 
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    res.status(200).json({ success: true, services: result.rows });
  } catch (error) {
    console.error('Error fetching admin services:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// PUT /api/admin/services/:id/status - Update service status
router.put('/services/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.query('UPDATE services SET status = $1 WHERE id = $2', [status, id]);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating service status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/skills/:id - Fetch detailed skill info for admin
router.get('/skills/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.*, u.first_name, u.last_name, u.email as provider_email, u.profile_image as provider_avatar,
             u.department as provider_dept, u.graduation_year as provider_grad_year, u.account_status as provider_account_status
      FROM skills s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    
    res.status(200).json({ success: true, skill: result.rows[0] });
  } catch (error) {
    console.error('Error fetching admin skill detail:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/skills/:id/warn-provider - Warn skill provider with reason
router.post('/skills/:id/warn-provider', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Warning reason is required' });
    }

    const skillRes = await pool.query(
      'SELECT s.user_id, s.title, u.first_name, u.last_name FROM skills s JOIN users u ON s.user_id = u.id WHERE s.id = $1',
      [id]
    );
    if (skillRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    const skill = skillRes.rows[0];

    await pool.query(
      `INSERT INTO warn_history (target_type, target_id, target_user_id, admin_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      ['skill', id, skill.user_id, adminId, reason.trim()]
    );

    const notifTitle = 'Warning: Skill Listing';
    const notifMessage = `Your skill listing "${skill.title}" has received a warning from the admin. Reason: ${reason.trim()}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [skill.user_id, notifTitle, notifMessage, 'skill', id, 'WARNING']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${skill.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Provider warned successfully' });
  } catch (error) {
    console.error('Error warning skill provider:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/skills/:id/warn-history - Get warning history for a skill
router.get('/skills/:id/warn-history', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT wh.*, u.first_name as admin_first_name, u.last_name as admin_last_name
       FROM warn_history wh
       LEFT JOIN users u ON wh.admin_id = u.id
       WHERE wh.target_type = 'skill' AND wh.target_id = $1
       ORDER BY wh.created_at DESC`,
      [id]
    );
    res.status(200).json({ success: true, warnHistory: result.rows });
  } catch (error) {
    console.error('Error fetching skill warn history:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/services/:id - Fetch detailed service info for admin
router.get('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT s.*, u.first_name, u.last_name, u.email as provider_email, u.profile_image as provider_avatar
      FROM services s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    // Fetch suspension history for the service
    const suspensionRes = await pool.query(`
      SELECT sh.*, u.first_name as admin_first_name, u.last_name as admin_last_name 
      FROM suspension_history sh 
      LEFT JOIN users u ON sh.admin_id = u.id 
      WHERE sh.target_type = 'service' AND sh.target_id = $1 
      ORDER BY sh.created_at DESC
    `, [id]);
    
    res.status(200).json({ 
      success: true, 
      service: result.rows[0],
      suspensionHistory: suspensionRes.rows
    });
  } catch (error) {
    console.error('Error fetching admin service detail:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/services/:id/warn-provider - Warn service provider with reason
router.post('/services/:id/warn-provider', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Warning reason is required' });
    }

    const serviceRes = await pool.query(
      'SELECT s.user_id, s.title, u.first_name, u.last_name FROM services s JOIN users u ON s.user_id = u.id WHERE s.id = $1',
      [id]
    );
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    const service = serviceRes.rows[0];

    await pool.query(
      `INSERT INTO warn_history (target_type, target_id, target_user_id, admin_id, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      ['service', id, service.user_id, adminId, reason.trim()]
    );

    const notifTitle = 'Warning: Service Listing';
    const notifMessage = `Your service listing "${service.title}" has received a warning from the admin. Reason: ${reason.trim()}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [service.user_id, notifTitle, notifMessage, 'service', id, 'WARNING']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${service.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Provider warned successfully' });
  } catch (error) {
    console.error('Error warning service provider:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/services/:id/warn-history - Get warning history for a service
router.get('/services/:id/warn-history', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT wh.*, u.first_name as admin_first_name, u.last_name as admin_last_name
       FROM warn_history wh
       LEFT JOIN users u ON wh.admin_id = u.id
       WHERE wh.target_type = 'service' AND wh.target_id = $1
       ORDER BY wh.created_at DESC`,
      [id]
    );
    res.status(200).json({ success: true, warnHistory: result.rows });
  } catch (error) {
    console.error('Error fetching service warn history:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/orders - Fetch all orders with details (Optimized JOIN)
router.get('/orders', async (req, res) => {
  try {
    const { type } = req.query;
    let query = `
      SELECT o.*, 
             b.first_name as buyer_first_name, b.last_name as buyer_last_name,
             sl.first_name as seller_first_name, sl.last_name as seller_last_name,
             COALESCE(p.title, sk.title, sv.title, 'Unknown Item') as "itemTitle"
      FROM orders o
      JOIN users b ON o.buyer_id = b.id
      JOIN users sl ON o.seller_id = sl.id
      LEFT JOIN products p ON o.item_type = 'product' AND o.item_id = p.id
      LEFT JOIN skills sk ON o.item_type = 'skill' AND o.item_id = sk.id
      LEFT JOIN services sv ON o.item_type = 'service' AND o.item_id = sv.id
    `;
    
    let queryParams = [];
    if (type) {
      query += ` WHERE o.item_type = $1`;
      queryParams.push(type);
    }
    
    query += ` ORDER BY o.created_at DESC`;
    
    const result = await pool.query(query, queryParams);
    res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/orders/:id - Fetch single order detail
router.get('/orders/:id', async (req, res) => {
  console.log(`Admin GET /orders/${req.params.id} hit`);
  try {
    const { id } = req.params;
    const query = `
      SELECT o.*, 
             b.first_name as buyer_first_name, b.last_name as buyer_last_name,
             sl.first_name as seller_first_name, sl.last_name as seller_last_name,
             COALESCE(p.title, sk.title, sv.title, 'Unknown Item') as "itemTitle"
      FROM orders o
      JOIN users b ON o.buyer_id = b.id
      JOIN users sl ON o.seller_id = sl.id
      LEFT JOIN products p ON o.item_type = 'product' AND o.item_id = p.id
      LEFT JOIN skills sk ON o.item_type = 'skill' AND o.item_id = sk.id
      LEFT JOIN services sv ON o.item_type = 'service' AND o.item_id = sv.id
      WHERE o.id = $1
    `;
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    res.json({ success: true, order: result.rows[0] });
  } catch (error) {
    console.error('Error fetching admin order detail:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/reports - Fetch all reports with details
router.get('/reports', async (req, res) => {
  try {
    const query = `
      SELECT r.*, 
             u1.first_name as reporter_first_name, u1.last_name as reporter_last_name,
             u2.first_name as reported_first_name, u2.last_name as reported_last_name,
             COALESCE(p.title, sk.title, sv.title, 'Unknown Item') as "itemTitle",
             ah.action_taken, ah.action_reason
      FROM reports r
      JOIN users u1 ON r.reporter_id = u1.id
      JOIN users u2 ON r.reported_id = u2.id
      LEFT JOIN LATERAL (
        SELECT chat_id, order_id 
        FROM chats 
        WHERE chat_id = r.chat_id
           OR (r.chat_id IS NULL AND (
                (buyer_id = r.reporter_id AND seller_id = r.reported_id) OR
                (buyer_id = r.reported_id AND seller_id = r.reporter_id)
              ))
        ORDER BY created_at DESC 
        LIMIT 1
      ) c_fallback ON TRUE
      LEFT JOIN orders o_fallback ON c_fallback.order_id = o_fallback.id
      LEFT JOIN products p ON COALESCE(r.item_type, o_fallback.item_type) = 'product' AND COALESCE(r.item_id, o_fallback.item_id) = p.id
      LEFT JOIN skills sk ON COALESCE(r.item_type, o_fallback.item_type) = 'skill' AND COALESCE(r.item_id, o_fallback.item_id) = sk.id
      LEFT JOIN services sv ON COALESCE(r.item_type, o_fallback.item_type) = 'service' AND COALESCE(r.item_id, o_fallback.item_id) = sv.id
      LEFT JOIN LATERAL (
        SELECT action_taken, action_reason 
        FROM admin_action_history 
        WHERE report_id = r.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) ah ON TRUE
      ORDER BY r.created_at DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, reports: result.rows });
  } catch (error) {
    console.error('Error fetching admin reports:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/reports/:id/messages - Fetch messages related to a report
router.get('/reports/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    // 1. Get report details
    const reportRes = await pool.query(`
      SELECT r.*, 
             u1.first_name as reporter_first_name, u1.last_name as reporter_last_name,
             u2.first_name as reported_first_name, u2.last_name as reported_last_name,
             COALESCE(p.title, sk.title, sv.title, 'Unknown Item') as "itemTitle"
      FROM reports r
      JOIN users u1 ON r.reporter_id = u1.id
      JOIN users u2 ON r.reported_id = u2.id
      LEFT JOIN LATERAL (
        SELECT chat_id, order_id 
        FROM chats 
        WHERE chat_id = r.chat_id
           OR (r.chat_id IS NULL AND (
                (buyer_id = r.reporter_id AND seller_id = r.reported_id) OR
                (buyer_id = r.reported_id AND seller_id = r.reporter_id)
              ))
        ORDER BY created_at DESC 
        LIMIT 1
      ) c_fallback ON TRUE
      LEFT JOIN orders o_fallback ON c_fallback.order_id = o_fallback.id
      LEFT JOIN products p ON COALESCE(r.item_type, o_fallback.item_type) = 'product' AND COALESCE(r.item_id, o_fallback.item_id) = p.id
      LEFT JOIN skills sk ON COALESCE(r.item_type, o_fallback.item_type) = 'skill' AND COALESCE(r.item_id, o_fallback.item_id) = sk.id
      LEFT JOIN services sv ON COALESCE(r.item_type, o_fallback.item_type) = 'service' AND COALESCE(r.item_id, o_fallback.item_id) = sv.id
      WHERE r.id = $1
    `, [id]);

    if (reportRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Report not found' });
    const report = reportRes.rows[0];

    // Enforce that admin can only view chats under review or considered a security concern
    if (report.status !== 'Pending') {
      const actionRes = await pool.query(
        'SELECT action_taken FROM admin_action_history WHERE report_id = $1 ORDER BY created_at DESC LIMIT 1',
        [id]
      );
      const actionTaken = actionRes.rows[0]?.action_taken || '';
      const isSecurityConcern = actionTaken.includes('Restrict Chat') || actionTaken.includes('Suspend User');

      if (!isSecurityConcern) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access Denied: You can only view chat logs while they are under review or if the action taken is a security concern (Restriction/Suspension).' 
        });
      }
    }

    // 2. Find messages between these two users
    const messagesRes = await pool.query(`
      SELECT m.*, u.first_name as sender_name
      FROM messages m
      JOIN chats c ON m.chat_id = c.chat_id
      JOIN users u ON m.sender_id = u.id
      WHERE (c.buyer_id = $1 AND c.seller_id = $2) OR (c.buyer_id = $2 AND c.seller_id = $1)
      ORDER BY m.created_at ASC
    `, [report.reporter_id, report.reported_id]);

    res.json({ 
      success: true, 
      report: report,
      messages: messagesRes.rows 
    });
  } catch (error) {
    console.error('Error fetching admin chat review:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/verifications - Fetch verification requests (skills published by users)
router.get('/verifications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.first_name, u.last_name, u.email, u.department, u.graduation_year, u.profile_image
      FROM skills s
      JOIN users u ON s.user_id = u.id
      ORDER BY CASE WHEN s.status = 'Pending Verification' THEN 1 ELSE 2 END, s.created_at DESC, s.id DESC
    `);
    res.status(200).json({ success: true, verifications: result.rows });
  } catch (error) {
    console.error('Error fetching verification requests:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// PUT /api/admin/verifications/bulk/status - Update status of multiple requests in bulk
router.put('/verifications/bulk/status', async (req, res) => {
  try {
    const { ids, status, rejectionReason } = req.body; // ids: Array of skill ids, status: 'Active', 'Rejected', or 'Pending Verification'
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty IDs array' });
    }

    const io = req.app.get('io');
    const updatedCount = ids.length;

    for (const id of ids) {
      // Fetch owner and title for notification
      const skillRes = await pool.query('SELECT user_id, title FROM skills WHERE id = $1', [id]);
      if (skillRes.rows.length > 0) {
        const skill = skillRes.rows[0];
        const ownerId = skill.user_id;
        const skillTitle = skill.title;

        await pool.query(
          'UPDATE skills SET status = $1, rejection_reason = $2 WHERE id = $3',
          [status, status === 'Rejected' ? rejectionReason : null, id]
        );

        let notifTitle = '';
        let notifMessage = '';
        let notifStatus = '';

        if (status === 'Active') {
          notifTitle = 'Skill Session Approved';
          notifMessage = `Your skill listing "${skillTitle}" has been approved and published successfully!`;
          notifStatus = 'APPROVED';
        } else if (status === 'Rejected') {
          notifTitle = 'Skill Session Rejected';
          notifMessage = `Your skill listing "${skillTitle}" was rejected.`;
          notifStatus = 'REJECTED';
        } else {
          // Mark for Review (Pending Verification)
          notifTitle = 'Skill Session Marked for Review';
          notifMessage = `Your skill listing "${skillTitle}" has been marked for review by administration.`;
          notifStatus = 'PENDING';
        }

        const insertNotifRes = await pool.query(
          `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status, rejection_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            ownerId,
            notifTitle,
            notifMessage,
            'skill',
            id,
            notifStatus,
            status === 'Rejected' ? rejectionReason : null
          ]
        );
        const newNotif = insertNotifRes.rows[0];

        if (io) {
          io.to(`user_${ownerId}`).emit('new_general_notification', {
            id: `general-${newNotif.id}`,
            type: 'general_notification',
            title: notifTitle,
            message: notifMessage,
            item_type: 'skill',
            item_id: id,
            status: notifStatus,
            rejection_reason: status === 'Rejected' ? rejectionReason : null,
            created_at: newNotif.created_at
          });
        }
      }
    }

    res.status(200).json({ success: true, message: `Successfully updated ${updatedCount} requests to ${status}` });
  } catch (error) {
    console.error('Error updating bulk verification status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// PUT /api/admin/verifications/:id/status - Update status of a request (skills published by users)
router.put('/verifications/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body; // status will be 'Active' or 'Rejected'

    // Fetch owner and title for notification
    const skillRes = await pool.query('SELECT user_id, title FROM skills WHERE id = $1', [id]);
    if (skillRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    const skill = skillRes.rows[0];
    const ownerId = skill.user_id;
    const skillTitle = skill.title;

    await pool.query(
      'UPDATE skills SET status = $1, rejection_reason = $2 WHERE id = $3',
      [status, status === 'Rejected' ? rejectionReason : null, id]
    );

    const notifTitle = status === 'Active' ? 'Skill Session Approved' : 'Skill Session Rejected';
    const notifMessage = status === 'Active'
      ? `Your skill listing "${skillTitle}" has been approved and published successfully!`
      : `Your skill listing "${skillTitle}" was rejected.`;

    const insertNotifRes = await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status, rejection_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        ownerId,
        notifTitle,
        notifMessage,
        'skill',
        id,
        status === 'Active' ? 'APPROVED' : 'REJECTED',
        status === 'Rejected' ? rejectionReason : null
      ]
    );
    const newNotif = insertNotifRes.rows[0];

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${ownerId}`).emit('new_general_notification', {
        id: `general-${newNotif.id}`,
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        item_type: 'skill',
        item_id: id,
        status: status === 'Active' ? 'APPROVED' : 'REJECTED',
        rejection_reason: status === 'Rejected' ? rejectionReason : null,
        created_at: newNotif.created_at
      });
    }

    res.status(200).json({ success: true, message: `Skill verification status updated to ${status}` });
  } catch (error) {
    console.error('Error updating verification status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/reports/pending/count - Get pending reports count
router.get('/reports/pending/count', async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM reports WHERE status = 'Pending'");
    res.status(200).json({ success: true, count: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error('Error fetching pending reports count:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/reports/:id/resolve - Resolve a report without further action
router.post('/reports/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Update report status
    await pool.query("UPDATE reports SET status = 'Resolved' WHERE id = $1", [id]);

    // Insert into action history
    await pool.query(
      `INSERT INTO admin_action_history (admin_id, report_id, action_taken, action_reason)
       VALUES ($1, $2, $3, $4)`,
      [adminId, id, 'Resolve Report', 'Resolved report with no action taken']
    );

    res.status(200).json({ success: true, message: 'Report resolved successfully' });
  } catch (error) {
    console.error('Error resolving report:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/reports/:id/warn - Warn the reported user
router.post('/reports/:id/warn', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Fetch report details
    const reportRes = await pool.query('SELECT reported_id FROM reports WHERE id = $1', [id]);
    if (reportRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    const reportedId = reportRes.rows[0].reported_id;

    // Create notification
    const notifTitle = "Community Guideline Warning";
    const notifMessage = "A complaint was received. Please follow community guidelines.";
    
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reportedId, notifTitle, notifMessage, 'report', id, 'WARNING']
    );

    // Update report status
    await pool.query("UPDATE reports SET status = 'Resolved' WHERE id = $1", [id]);

    // Insert into action history
    await pool.query(
      `INSERT INTO admin_action_history (admin_id, report_id, action_taken, action_reason)
       VALUES ($1, $2, $3, $4)`,
      [adminId, id, 'Warn User', 'Warned user to follow community guidelines']
    );

    // WebSocket broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${reportedId}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'User warned successfully' });
  } catch (error) {
    console.error('Error warning user:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/reports/:id/restrict - Restrict the specific chat session
router.post('/reports/:id/restrict', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    // Fetch report details
    const reportRes = await pool.query('SELECT reporter_id, reported_id, item_type, item_id, chat_id FROM reports WHERE id = $1', [id]);
    if (reportRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    const { reporter_id: reporterId, reported_id: reportedId, item_type: itemType, item_id: itemId, chat_id: reportChatId } = reportRes.rows[0];

    let chatId = reportChatId;
    if (!chatId) {
      // Find the chat session based on users and item
      const chatQuery = `
        SELECT c.chat_id 
        FROM chats c
        JOIN orders o ON c.order_id = o.id
        WHERE o.item_type = $1 AND o.item_id = $2
          AND ((c.buyer_id = $3 AND c.seller_id = $4) OR (c.buyer_id = $4 AND c.seller_id = $3))
      `;
      const chatRes = await pool.query(chatQuery, [itemType, itemId, reporterId, reportedId]);
      if (chatRes.rows.length > 0) {
        chatId = chatRes.rows[0].chat_id;
      } else {
        // Fallback to any active chat between these two users
        const fallbackRes = await pool.query(
          `SELECT chat_id FROM chats WHERE (buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1) LIMIT 1`,
          [reporterId, reportedId]
        );
        if (fallbackRes.rows.length > 0) {
          chatId = fallbackRes.rows[0].chat_id;
        }
      }
    }

    if (!chatId) {
      return res.status(400).json({ success: false, message: 'No chat session found for this report to restrict.' });
    }

    // Set chat status to Restricted
    await pool.query("UPDATE chats SET status = 'Restricted' WHERE chat_id = $1", [chatId]);

    // Send notifications to both users
    const notifTitle = "Conversation Restricted";
    const notifMessage = reason 
      ? `A conversation was restricted by admin due to a complaint. Reason: ${reason}`
      : "A conversation was restricted by admin due to a complaint.";
    
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reporterId, notifTitle, notifMessage, 'chat', chatId, 'RESTRICTED']
    );
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reportedId, notifTitle, notifMessage, 'chat', chatId, 'RESTRICTED']
    );

    // Update report status
    await pool.query("UPDATE reports SET status = 'Resolved' WHERE id = $1", [id]);

    // Insert into action history
    await pool.query(
      `INSERT INTO admin_action_history (admin_id, report_id, action_taken, action_reason)
       VALUES ($1, $2, $3, $4)`,
      [adminId, id, 'Restrict Chat', reason || `Restricted chat session ID ${chatId}`]
    );

    // WebSocket broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${reporterId}`).to(`user_${reportedId}`).emit('chat_restricted', { chatId, reason });
      
      io.to(`user_${reporterId}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
      io.to(`user_${reportedId}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Chat restricted successfully' });
  } catch (error) {
    console.error('Error restricting chat:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/reports/:id/suspend - Suspend reported user
router.post('/reports/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, reason } = req.body; // duration: '24h', '7d', 'permanent'
    const adminId = req.user.id;

    if (!duration || !reason) {
      return res.status(400).json({ success: false, message: 'Duration and reason are required' });
    }

    // Fetch report details
    const reportRes = await pool.query('SELECT reported_id FROM reports WHERE id = $1', [id]);
    if (reportRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    const reportedId = reportRes.rows[0].reported_id;

    // Calculate suspension expiry
    let suspendedUntil = null;
    let durationLabel = 'permanently';
    if (duration === '24h') {
      suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      durationLabel = 'for 24 hours';
    } else if (duration === '7d') {
      suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      durationLabel = 'for 7 days';
    }

    // Update user status
    await pool.query(
      "UPDATE users SET account_status = 'Suspended', suspended_until = $1 WHERE id = $2",
      [suspendedUntil, reportedId]
    );

    // Create notification
    const notifTitle = "Account Suspended";
    const notifMessage = `Your messaging access was suspended by an admin ${durationLabel}. Reason: ${reason}`;
    
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reportedId, notifTitle, notifMessage, 'user', reportedId, 'SUSPENDED']
    );

    // Update report status
    await pool.query("UPDATE reports SET status = 'Resolved' WHERE id = $1", [id]);

    // Insert into action history
    await pool.query(
      `INSERT INTO admin_action_history (admin_id, report_id, action_taken, action_reason)
       VALUES ($1, $2, $3, $4)`,
      [adminId, id, `Suspend User (${duration})`, reason]
    );

    // WebSocket broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${reportedId}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'User suspended successfully' });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/admin/reports/analytics - Get full analytics dashboard data
router.get('/reports/analytics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilterClause = '';
    let queryParams = [];
    if (startDate && endDate) {
      dateFilterClause = ' AND r.created_at >= $1 AND r.created_at <= $2';
      queryParams = [new Date(startDate), new Date(endDate)];
    }

    // 1. Stats Counters (filtered by date range)
    const totalReportsRes = await pool.query(
      `SELECT COUNT(*) FROM reports r WHERE 1=1${dateFilterClause}`,
      queryParams
    );
    const pendingReportsRes = await pool.query(
      `SELECT COUNT(*) FROM reports r WHERE r.status = 'Pending'${dateFilterClause}`,
      queryParams
    );
    const resolvedReportsRes = await pool.query(
      `SELECT COUNT(*) FROM reports r WHERE r.status = 'Resolved'${dateFilterClause}`,
      queryParams
    );

    // Warnings: we check admin_action_history entries where action_taken = 'Warn User' within the date range
    let actionDateClause = '';
    let actionQueryParams = [];
    if (startDate && endDate) {
      actionDateClause = ' WHERE created_at >= $1 AND created_at <= $2';
      actionQueryParams = [new Date(startDate), new Date(endDate)];
    }
    const warningsRes = await pool.query(
      `SELECT COUNT(*) FROM admin_action_history${actionDateClause ? actionDateClause + " AND action_taken = 'Warn User'" : " WHERE action_taken = 'Warn User'"}`,
      actionQueryParams
    );

    // Restricted chats (total active restricted, ignore date filters as it is a current system status, or we can filter by action timestamp)
    const restrictedRes = await pool.query(
      `SELECT COUNT(*) FROM chats c JOIN orders o ON c.order_id = o.id WHERE c.status = 'Restricted'`
    );

    // Suspended users (total active suspended)
    const suspendedRes = await pool.query(
      `SELECT COUNT(*) FROM users WHERE account_status = 'Suspended'`
    );

    // 2. Complaint Categories Distribution (bar chart data)
    const categoriesRes = await pool.query(
      `SELECT 
        CASE 
          WHEN LOWER(r.reason) LIKE '%spam%' THEN 'Spam'
          WHEN LOWER(r.reason) LIKE '%harass%' OR LOWER(r.reason) LIKE '%abuse%' THEN 'Harassment'
          WHEN LOWER(r.reason) LIKE '%language%' OR LOWER(r.reason) LIKE '%rude%' OR LOWER(r.reason) LIKE '%swear%' OR LOWER(r.reason) LIKE '%inappropriate%' THEN 'Inappropriate Language'
          WHEN LOWER(r.reason) LIKE '%scam%' OR LOWER(r.reason) LIKE '%fraud%' OR LOWER(r.reason) LIKE '%cheat%' THEN 'Scam'
          WHEN LOWER(r.reason) LIKE '%fake%' OR LOWER(r.reason) LIKE '%mislead%' THEN 'Fake Listings'
          ELSE 'Other'
        END as category,
        COUNT(*) as count
      FROM reports r
      WHERE 1=1${dateFilterClause}
      GROUP BY category
      ORDER BY count DESC`,
      queryParams
    );

    // 3. Report Activity Timeline (past 30 days or filtered date range)
    let timelineQuery = '';
    let timelineParams = [];
    if (startDate && endDate) {
      timelineQuery = `
        SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
        FROM reports
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY date
        ORDER BY date ASC
      `;
      timelineParams = [new Date(startDate), new Date(endDate)];
    } else {
      timelineQuery = `
        SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
        FROM reports
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY date
        ORDER BY date ASC
      `;
    }
    const timelineRes = await pool.query(timelineQuery, timelineParams);

    // 4. Top Reported Users
    const topReportedRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.profile_image, COUNT(r.id) as report_count
       FROM users u
       JOIN reports r ON u.id = r.reported_id
       WHERE 1=1${dateFilterClause}
       GROUP BY u.id
       ORDER BY report_count DESC
       LIMIT 5`,
      queryParams
    );

    // 5. Most Active Moderators
    let modDateClause = '';
    let modQueryParams = [];
    if (startDate && endDate) {
      modDateClause = ' AND ah.created_at >= $1 AND ah.created_at <= $2';
      modQueryParams = [new Date(startDate), new Date(endDate)];
    }
    const topModeratorsRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.profile_image, COUNT(ah.id) as action_count
       FROM users u
       JOIN admin_action_history ah ON u.id = ah.admin_id
       WHERE 1=1${modDateClause}
       GROUP BY u.id
       ORDER BY action_count DESC
       LIMIT 5`,
      modQueryParams
    );

    // 6. Suspended Users Detail List
    const suspensionListRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.profile_image, u.suspended_until,
              ah.action_reason as reason, ah.created_at as suspended_at,
              admin.first_name as admin_name
       FROM users u
       LEFT JOIN LATERAL (
         SELECT action_reason, created_at, admin_id
         FROM admin_action_history
         WHERE action_taken LIKE 'Suspend User%'
           AND report_id IN (SELECT id FROM reports WHERE reported_id = u.id)
         ORDER BY created_at DESC
         LIMIT 1
       ) ah ON TRUE
       LEFT JOIN users admin ON ah.admin_id = admin.id
       WHERE u.account_status = 'Suspended'
       ORDER BY ah.created_at DESC`
    );

    // 7. Restricted Conversations List
    const restrictedListRes = await pool.query(
      `SELECT c.chat_id, c.created_at as chat_created_at,
              buyer.first_name as buyer_first_name, buyer.last_name as buyer_last_name,
              seller.first_name as seller_first_name, seller.last_name as seller_last_name,
              COALESCE(p.title, sk.title, sv.title, 'Unknown Item') as "itemTitle",
              ah.created_at as restricted_at, ah.action_reason as reason,
              admin.first_name as admin_name
       FROM chats c
       JOIN users buyer ON c.buyer_id = buyer.id
       JOIN users seller ON c.seller_id = seller.id
       JOIN orders o ON c.order_id = o.id
       LEFT JOIN products p ON o.item_type = 'product' AND o.item_id = p.id
       LEFT JOIN skills sk ON o.item_type = 'skill' AND o.item_id = sk.id
       LEFT JOIN services sv ON o.item_type = 'service' AND o.item_id = sv.id
       LEFT JOIN LATERAL (
         SELECT created_at, action_reason, admin_id
         FROM admin_action_history
         WHERE action_taken = 'Restrict Chat'
           AND report_id IN (SELECT id FROM reports WHERE chat_id = c.chat_id)
         ORDER BY created_at DESC
         LIMIT 1
       ) ah ON TRUE
       LEFT JOIN users admin ON ah.admin_id = admin.id
       WHERE c.status = 'Restricted'
       ORDER BY ah.created_at DESC`
    );

    // 8. Full Action Logs List
    const moderationLogsRes = await pool.query(
      `SELECT ah.id, ah.action_taken, ah.action_reason, ah.created_at as timestamp,
              admin.first_name as admin_first_name, admin.last_name as admin_last_name,
              r.reason as complaint_reason,
              reporter.first_name as reporter_name,
              reported.first_name as reported_name
       FROM admin_action_history ah
       JOIN users admin ON ah.admin_id = admin.id
       LEFT JOIN reports r ON ah.report_id = r.id
       LEFT JOIN users reporter ON r.reporter_id = reporter.id
       LEFT JOIN users reported ON r.reported_id = reported.id
       ORDER BY ah.created_at DESC`
    );

    res.status(200).json({
      success: true,
      analytics: {
        stats: {
          totalReports: parseInt(totalReportsRes.rows[0].count, 10),
          pendingReports: parseInt(pendingReportsRes.rows[0].count, 10),
          resolvedReports: parseInt(resolvedReportsRes.rows[0].count, 10),
          warningsIssued: parseInt(warningsRes.rows[0].count, 10),
          restrictedChats: parseInt(restrictedRes.rows[0].count, 10),
          suspendedUsers: parseInt(suspendedRes.rows[0].count, 10)
        },
        categories: categoriesRes.rows,
        timeline: timelineRes.rows,
        topReported: topReportedRes.rows,
        topModerators: topModeratorsRes.rows,
        suspensions: suspensionListRes.rows,
        restrictedConversations: restrictedListRes.rows,
        moderationLogs: moderationLogsRes.rows
      }
    });

  } catch (error) {
    console.error('Error fetching admin reports analytics:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/students/:id/suspend - Suspend student account
router.post('/students/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, reason, severityLevel } = req.body;
    const adminId = req.user.id;

    if (!duration || !reason || !severityLevel) {
      return res.status(400).json({ success: false, message: 'Duration, reason, and severity level are required' });
    }

    let suspendedUntil = null;
    let durationLabel = 'permanently';
    if (duration === '24h') {
      suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      durationLabel = 'for 24 hours';
    } else if (duration === '7d') {
      suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      durationLabel = 'for 7 days';
    } else if (duration === '30d') {
      suspendedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      durationLabel = 'for 30 days';
    }

    // 1. Update user
    await pool.query(
      "UPDATE users SET account_status = 'Suspended', suspended_until = $1 WHERE id = $2",
      [suspendedUntil, id]
    );

    // 2. Add to suspension history
    await pool.query(
      `INSERT INTO suspension_history (target_type, target_id, admin_id, action, duration, suspended_until, reason, severity_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['user', id, adminId, 'suspend', duration, suspendedUntil, reason, severityLevel]
    );

    // 3. Create notification
    const notifTitle = "Account Suspended";
    const notifMessage = `Your student account access has been suspended ${durationLabel}. Reason: ${reason} [Severity: ${severityLevel}]`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, notifTitle, notifMessage, 'user', id, 'SUSPENDED']
    );

    // 4. WebSocket notify
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
      io.to(`user_${id}`).emit('user_suspended', { reason, suspendedUntil });
    }

    res.status(200).json({ success: true, message: 'Student suspended successfully' });
  } catch (error) {
    console.error('Error suspending student:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/students/:id/extend-suspension - Extend student suspension
router.post('/students/:id/extend-suspension', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, reason, severityLevel } = req.body;
    const adminId = req.user.id;

    if (!duration || !reason || !severityLevel) {
      return res.status(400).json({ success: false, message: 'Duration, reason, and severity level are required' });
    }

    // Fetch user's current suspension status
    const userRes = await pool.query('SELECT suspended_until FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let currentSusp = userRes.rows[0].suspended_until;
    let baseTime = (currentSusp && new Date(currentSusp) > new Date()) ? new Date(currentSusp).getTime() : Date.now();

    let newSuspendedUntil = null;
    let durationLabel = 'permanently';
    if (duration === '24h') {
      newSuspendedUntil = new Date(baseTime + 24 * 60 * 60 * 1000);
      durationLabel = 'by 24 hours';
    } else if (duration === '7d') {
      newSuspendedUntil = new Date(baseTime + 7 * 24 * 60 * 60 * 1000);
      durationLabel = 'by 7 days';
    } else if (duration === '30d') {
      newSuspendedUntil = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
      durationLabel = 'by 30 days';
    }

    // 1. Update user
    await pool.query(
      "UPDATE users SET account_status = 'Suspended', suspended_until = $1 WHERE id = $2",
      [newSuspendedUntil, id]
    );

    // 2. Add to suspension history
    await pool.query(
      `INSERT INTO suspension_history (target_type, target_id, admin_id, action, duration, suspended_until, reason, severity_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['user', id, adminId, 'extend', duration, newSuspendedUntil, reason, severityLevel]
    );

    // 3. Create notification
    const notifTitle = "Suspension Extended";
    const notifMessage = `Your student account suspension has been extended ${durationLabel}. New Expiry: ${newSuspendedUntil ? newSuspendedUntil.toLocaleDateString() : 'Permanent'}. Reason: ${reason}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, notifTitle, notifMessage, 'user', id, 'SUSPENDED_EXTENDED']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Suspension extended successfully' });
  } catch (error) {
    console.error('Error extending suspension:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/students/:id/restore - Restore/revoke student suspension
router.post('/students/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    // 1. Update user
    await pool.query(
      "UPDATE users SET account_status = 'Active', suspended_until = NULL WHERE id = $1",
      [id]
    );

    // 2. Add to suspension history
    await pool.query(
      `INSERT INTO suspension_history (target_type, target_id, admin_id, action, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      ['user', id, adminId, 'restore', reason || 'Suspension revoked by administrator']
    );

    // 3. Create notification
    const notifTitle = "Account Access Restored";
    const notifMessage = `Your account suspension was revoked and full access has been restored. Reason: ${reason || 'Administrator review'}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, notifTitle, notifMessage, 'user', id, 'ACTIVE']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
      io.to(`user_${id}`).emit('user_restored');
    }

    res.status(200).json({ success: true, message: 'Student suspension revoked and access restored.' });
  } catch (error) {
    console.error('Error restoring student:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/services/:id/suspend - Suspend a service listing
router.post('/services/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, reason, severityLevel } = req.body;
    const adminId = req.user.id;

    if (!duration || !reason || !severityLevel) {
      return res.status(400).json({ success: false, message: 'Duration, reason, and severity level are required' });
    }

    // Fetch service details to get owner
    const serviceRes = await pool.query('SELECT user_id, title FROM services WHERE id = $1', [id]);
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    const service = serviceRes.rows[0];

    let suspendedUntil = null;
    let durationLabel = 'permanently';
    if (duration === '24h') {
      suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      durationLabel = 'for 24 hours';
    } else if (duration === '7d') {
      suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      durationLabel = 'for 7 days';
    } else if (duration === '30d') {
      suspendedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      durationLabel = 'for 30 days';
    }

    // 1. Update service
    await pool.query(
      "UPDATE services SET status = 'Suspended', suspended_until = $1 WHERE id = $2",
      [suspendedUntil, id]
    );

    // 2. Add to suspension history
    await pool.query(
      `INSERT INTO suspension_history (target_type, target_id, admin_id, action, duration, suspended_until, reason, severity_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['service', id, adminId, 'suspend', duration, suspendedUntil, reason, severityLevel]
    );

    // 3. Create notification for owner
    const notifTitle = "Service Listing Suspended";
    const notifMessage = `Your service listing "${service.title}" has been suspended ${durationLabel}. Reason: ${reason}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [service.user_id, notifTitle, notifMessage, 'service', id, 'SUSPENDED']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${service.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Service suspended successfully' });
  } catch (error) {
    console.error('Error suspending service:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/services/:id/extend-suspension - Extend service suspension
router.post('/services/:id/extend-suspension', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration, reason, severityLevel } = req.body;
    const adminId = req.user.id;

    if (!duration || !reason || !severityLevel) {
      return res.status(400).json({ success: false, message: 'Duration, reason, and severity level are required' });
    }

    const serviceRes = await pool.query('SELECT user_id, title, suspended_until FROM services WHERE id = $1', [id]);
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    const service = serviceRes.rows[0];

    let baseTime = (service.suspended_until && new Date(service.suspended_until) > new Date()) ? new Date(service.suspended_until).getTime() : Date.now();

    let newSuspendedUntil = null;
    let durationLabel = 'permanently';
    if (duration === '24h') {
      newSuspendedUntil = new Date(baseTime + 24 * 60 * 60 * 1000);
      durationLabel = 'by 24 hours';
    } else if (duration === '7d') {
      newSuspendedUntil = new Date(baseTime + 7 * 24 * 60 * 60 * 1000);
      durationLabel = 'by 7 days';
    } else if (duration === '30d') {
      newSuspendedUntil = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);
      durationLabel = 'by 30 days';
    }

    // 1. Update service
    await pool.query(
      "UPDATE services SET status = 'Suspended', suspended_until = $1 WHERE id = $2",
      [newSuspendedUntil, id]
    );

    // 2. Add to suspension history
    await pool.query(
      `INSERT INTO suspension_history (target_type, target_id, admin_id, action, duration, suspended_until, reason, severity_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['service', id, adminId, 'extend', duration, newSuspendedUntil, reason, severityLevel]
    );

    // 3. Create notification
    const notifTitle = "Service Suspension Extended";
    const notifMessage = `Your service listing "${service.title}" suspension has been extended ${durationLabel}. New Expiry: ${newSuspendedUntil ? newSuspendedUntil.toLocaleDateString() : 'Permanent'}. Reason: ${reason}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [service.user_id, notifTitle, notifMessage, 'service', id, 'SUSPENDED_EXTENDED']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${service.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Service suspension extended successfully' });
  } catch (error) {
    console.error('Error extending service suspension:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// POST /api/admin/services/:id/restore - Restore/revoke service suspension
router.post('/services/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const serviceRes = await pool.query('SELECT user_id, title FROM services WHERE id = $1', [id]);
    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    const service = serviceRes.rows[0];

    // 1. Update service
    await pool.query(
      "UPDATE services SET status = 'Active', suspended_until = NULL WHERE id = $1",
      [id]
    );

    // 2. Add to suspension history
    await pool.query(
      `INSERT INTO suspension_history (target_type, target_id, admin_id, action, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      ['service', id, adminId, 'restore', reason || 'Service suspension revoked by administrator']
    );

    // 3. Create notification for owner
    const notifTitle = "Service Listing Restored";
    const notifMessage = `Your service listing "${service.title}" has been restored. Reason: ${reason || 'Administrator review'}`;
    await pool.query(
      `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [service.user_id, notifTitle, notifMessage, 'service', id, 'ACTIVE']
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${service.user_id}`).emit('new_general_notification', {
        type: 'general_notification',
        title: notifTitle,
        message: notifMessage,
        created_at: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: 'Service listing restored successfully' });
  } catch (error) {
    console.error('Error restoring service:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
