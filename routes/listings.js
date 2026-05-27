const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/authMiddleware');
const fileToBase64 = require('../utils/fileToBase64');

// Multer memory storage (Vercel-compatible, no disk writes)
const storage = multer.memoryStorage();
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const fileFilter = (req, file, cb) => {
  if (allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  }
};
const upload = multer({ storage: storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Create Product Route
router.post('/products', verifyToken, upload.array('images', 4), async (req, res) => {
  try {
    const { userId, title, description, price, condition, category, quantity } = req.body;
    // Convert multiple image files to base64 strings
    const imageUrls = req.files ? req.files.map(file => fileToBase64(file)).filter(Boolean) : [];
    
    // Extract authenticated user ID, or fallback safely
    const uid = req.user && req.user.id ? req.user.id : (userId && !isNaN(parseInt(userId, 10)) ? parseInt(userId, 10) : null);
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Invalid or missing user ID' });
    }

    const qty = quantity ? parseInt(quantity, 10) : 1;

    const result = await pool.query(
      `INSERT INTO products (user_id, title, description, price, condition, category, image_urls, quantity) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [uid, title, description, price, condition, category, imageUrls, qty]
    );

    const newProduct = result.rows[0];

    // Create inventory record
    await pool.query(
      `INSERT INTO inventory (item_type, item_id, available_quantity) VALUES ($1, $2, $3)`,
      ['product', newProduct.id, qty]
    );

    res.status(201).json({ success: true, product: newProduct, type: 'product' });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: 'Server Error handling product creation' });
  }
});

// Create Skill Route
router.post('/skills', verifyToken, upload.fields([{ name: 'images', maxCount: 4 }, { name: 'demoMedia', maxCount: 4 }]), async (req, res) => {
  try {
    const { 
      userId, title, description, category, chargeType, availableTimeSlot, hourlyRate, skillType,
      experienceLevel, prevExperience, sessionTypes, learningOutcomes, topicsCovered, languagesKnown, dayAvailability, portfolioLinks
    } = req.body;
    
    const imageUrls = req.files && req.files.images ? req.files.images.map(file => fileToBase64(file)).filter(Boolean) : [];
    const demoMedia = req.files && req.files.demoMedia ? req.files.demoMedia.map(file => fileToBase64(file)).filter(Boolean) : [];
    // Extract authenticated user ID, or fallback safely
    const uid = req.user && req.user.id ? req.user.id : (userId && !isNaN(parseInt(userId, 10)) ? parseInt(userId, 10) : null);
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Invalid or missing user ID' });
    }
    const rate = chargeType === 'Paid' ? parseFloat(hourlyRate || 0) : 0;
    const sType = skillType || 'Online';

    let parsedPortfolioLinks = null;
    if (portfolioLinks) {
      try {
        parsedPortfolioLinks = typeof portfolioLinks === 'string' ? JSON.parse(portfolioLinks) : portfolioLinks;
      } catch (err) {
        console.error('Error parsing portfolio links:', err);
      }
    }

    const result = await pool.query(
      `INSERT INTO skills (
        user_id, title, description, category, charge_type, available_time_slot, hourly_rate, skill_type, image_urls,
        experience_level, prev_experience, session_types, learning_outcomes, topics_covered, languages_known, day_availability, portfolio_links, demo_media, status
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
      [
        uid, title, description, category, chargeType, availableTimeSlot, rate, sType, imageUrls,
        experienceLevel || null, prevExperience || null, sessionTypes || null, learningOutcomes || null,
        topicsCovered || null, languagesKnown || null, dayAvailability || null, parsedPortfolioLinks, demoMedia,
        'Pending Verification'
      ]
    );
    const newSkill = result.rows[0];

    // Create inventory record
    await pool.query(
      `INSERT INTO inventory (item_type, item_id, available_quantity) VALUES ($1, $2, $3)`,
      ['skill', newSkill.id, 1]
    );

    res.status(201).json({ success: true, skill: newSkill, type: 'skill' });
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ success: false, message: 'Server Error handling skill creation' });
  }
});

// Create Service Route
router.post('/services', verifyToken, upload.array('images', 4), async (req, res) => {
  try {
    const { userId, title, description, serviceType, standardPlan, groupPlan } = req.body;
    const imageUrls = req.files ? req.files.map(file => fileToBase64(file)).filter(Boolean) : [];
    // Extract authenticated user ID, or fallback safely
    const uid = req.user && req.user.id ? req.user.id : (userId && !isNaN(parseInt(userId, 10)) ? parseInt(userId, 10) : null);
    if (!uid) {
      return res.status(400).json({ success: false, message: 'Invalid or missing user ID' });
    }

    const result = await pool.query(
      `INSERT INTO services (user_id, title, description, service_type, standard_plan, group_plan, image_urls) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [uid, title, description, serviceType, standardPlan ? parseFloat(standardPlan) : null, groupPlan ? parseFloat(groupPlan) : null, imageUrls]
    );
    const newService = result.rows[0];

    // Create inventory record
    await pool.query(
      `INSERT INTO inventory (item_type, item_id, available_quantity) VALUES ($1, $2, $3)`,
      ['service', newService.id, 1]
    );

    res.status(201).json({ success: true, service: newService, type: 'service' });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ success: false, message: 'Server Error handling service creation' });
  }
});

// Get All Products Route
router.get('/products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT products.*, 
             u.first_name, u.last_name, u.profile_image,
             COALESCE(inventory.available_quantity, 0) as available_quantity,
             COALESCE(avg_rev.avg_rating, 0.0) as rating,
             COALESCE(avg_rev.review_count, 0) as reviews
      FROM products
      LEFT JOIN users u ON products.user_id = u.id
      LEFT JOIN inventory ON inventory.item_id = products.id AND inventory.item_type = 'product'
      LEFT JOIN (
        SELECT 
          o.item_id,
          ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
          COUNT(r.id) as review_count
        FROM reviews r
        JOIN orders o ON r.order_id = o.id
        WHERE o.item_type = 'product'
        GROUP BY o.item_id
      ) avg_rev ON avg_rev.item_id = products.id
      WHERE u.account_status IS DISTINCT FROM 'Suspended' AND products.status IS DISTINCT FROM 'Suspended'
      ORDER BY products.created_at DESC
    `);
    res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching products' });
  }
});

// Get Products by Category Route
router.get('/products/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const result = await pool.query(`
      SELECT products.*, 
             u.first_name, u.last_name, u.profile_image,
             COALESCE(inventory.available_quantity, 0) as available_quantity,
             COALESCE(avg_rev.avg_rating, 0.0) as rating,
             COALESCE(avg_rev.review_count, 0) as reviews
      FROM products
      LEFT JOIN users u ON products.user_id = u.id
      LEFT JOIN inventory ON inventory.item_id = products.id AND inventory.item_type = 'product'
      LEFT JOIN (
        SELECT 
          o.item_id,
          ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
          COUNT(r.id) as review_count
        FROM reviews r
        JOIN orders o ON r.order_id = o.id
        WHERE o.item_type = 'product'
        GROUP BY o.item_id
      ) avg_rev ON avg_rev.item_id = products.id
      WHERE products.category = $1 AND u.account_status IS DISTINCT FROM 'Suspended' AND products.status IS DISTINCT FROM 'Suspended'
      ORDER BY products.created_at DESC
    `, [category]);
    res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching products by category' });
  }
});

// Get Single Product Route
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT products.*, users.first_name, users.last_name, users.email, users.profile_image, users.account_status as seller_account_status,
             COALESCE(inventory.available_quantity, 0) as available_quantity,
             COALESCE(avg_rev.avg_rating, 0.0) as rating,
             COALESCE(avg_rev.review_count, 0) as reviews
      FROM products 
      LEFT JOIN users ON products.user_id = users.id 
      LEFT JOIN inventory ON inventory.item_id = products.id AND inventory.item_type = 'product'
      LEFT JOIN (
        SELECT 
          o.item_id,
          ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
          COUNT(r.id) as review_count
        FROM reviews r
        JOIN orders o ON r.order_id = o.id
        WHERE o.item_type = 'product'
        GROUP BY o.item_id
      ) avg_rev ON avg_rev.item_id = products.id
      WHERE products.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const product = result.rows[0];

    // Decode token if available to check if user has requested notification
    let hasRequestedNotification = false;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const notifyRes = await pool.query(
          'SELECT 1 FROM notify_requests WHERE user_id = $1 AND product_id = $2',
          [decoded.id, id]
        );
        hasRequestedNotification = notifyRes.rows.length > 0;
      } catch (err) {
        // ignore invalid token
      }
    }

    res.status(200).json({ success: true, product: { ...product, hasRequestedNotification } });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching product' });
  }
});

// Get Products by User Route
router.get('/users/:id/products', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT products.*, COALESCE(inventory.available_quantity, 0) as available_quantity
      FROM products
      LEFT JOIN inventory ON inventory.item_id = products.id AND inventory.item_type = 'product'
      WHERE products.user_id = $1
      ORDER BY products.created_at DESC
    `, [id]);
    res.status(200).json({ success: true, products: result.rows });
  } catch (error) {
    console.error('Error fetching user products:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching user products' });
  }
});

// Get All Skills Route
router.get('/skills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT skills.*, users.first_name, users.last_name, users.profile_image,
             users.department, users.graduation_year, users.account_status,
             COALESCE(inventory.available_quantity, 0) as available_quantity,
             COALESCE(rev_stats.avg_rating, 0) as rating,
             COALESCE(rev_stats.review_count, 0) as review_count
      FROM skills 
      LEFT JOIN users ON skills.user_id = users.id 
      LEFT JOIN inventory ON inventory.item_id = skills.id AND inventory.item_type = 'skill'
      LEFT JOIN (
        SELECT reviewed_id, 
               ROUND(AVG(rating)::numeric, 1) as avg_rating,
               COUNT(*) as review_count
        FROM reviews
        GROUP BY reviewed_id
      ) rev_stats ON rev_stats.reviewed_id = skills.user_id
      WHERE skills.status = 'Active' AND users.account_status IS DISTINCT FROM 'Suspended'
      ORDER BY skills.created_at DESC
    `);
    res.status(200).json({ success: true, skills: result.rows });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching skills' });
  }
});

// Get Single Skill Route
router.get('/skills/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT skills.*, users.first_name, users.last_name, users.email, users.profile_image,
             users.department, users.graduation_year, users.account_status,
             COALESCE(inventory.available_quantity, 0) as available_quantity
      FROM skills 
      LEFT JOIN users ON skills.user_id = users.id 
      LEFT JOIN inventory ON inventory.item_id = skills.id AND inventory.item_type = 'skill'
      WHERE skills.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    
    const skill = result.rows[0];

    // Compute stats
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'Completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'Accepted') as accepted_count,
        COUNT(*) FILTER (WHERE status = 'Rejected') as rejected_count,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'Cancelled') as cancelled_count,
        COUNT(*) as total_count
      FROM orders 
      WHERE seller_id = $1 AND item_type = 'skill'
    `, [skill.user_id]);

    const stats = statsRes.rows[0];
    const totalCount = parseInt(stats.total_count, 10);
    const pendingCount = parseInt(stats.pending_count, 10);
    const completedCount = parseInt(stats.completed_count, 10);
    const acceptedCount = parseInt(stats.accepted_count, 10);
    const cancelledCount = parseInt(stats.cancelled_count, 10);

    const completedSessions = completedCount + acceptedCount;
    const responseRate = totalCount > 0 
      ? Math.round(((totalCount - pendingCount) / totalCount) * 100) 
      : 100;
    
    const everAccepted = completedCount + acceptedCount + cancelledCount;
    const completionRate = everAccepted > 0
      ? Math.round(((completedCount + acceptedCount) / everAccepted) * 100)
      : 100;

    res.status(200).json({ 
      success: true, 
      skill: {
        ...skill,
        completedSessions,
        responseRate,
        completionRate,
        responseTime: 'Within 2 hours'
      }
    });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching skill' });
  }
});

// Get Skills by User Route
router.get('/users/:id/skills', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM skills WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    res.status(200).json({ success: true, skills: result.rows });
  } catch (error) {
    console.error('Error fetching user skills:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching user skills' });
  }
});

// Get All Services Route
router.get('/services', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT services.*, users.first_name, users.last_name, users.profile_image,
             COALESCE(inventory.available_quantity, 0) as available_quantity
      FROM services 
      LEFT JOIN users ON services.user_id = users.id 
      LEFT JOIN inventory ON inventory.item_id = services.id AND inventory.item_type = 'service'
      WHERE users.account_status IS DISTINCT FROM 'Suspended' AND services.status IS DISTINCT FROM 'Suspended'
      ORDER BY services.created_at DESC
    `);
    res.status(200).json({ success: true, services: result.rows });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching services' });
  }
});

// Get Single Service Route
router.get('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT services.*, users.first_name, users.last_name, users.email, users.profile_image, users.account_status as provider_account_status,
             COALESCE(inventory.available_quantity, 0) as available_quantity
      FROM services 
      LEFT JOIN users ON services.user_id = users.id 
      LEFT JOIN inventory ON inventory.item_id = services.id AND inventory.item_type = 'service'
      WHERE services.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    let service = result.rows[0];

    // Check auto-expiry of service suspension
    if (service.status === 'Suspended' && service.suspended_until && new Date(service.suspended_until) <= new Date()) {
      await pool.query("UPDATE services SET status = 'Active', suspended_until = NULL WHERE id = $1", [id]);
      
      // Log expiry
      await pool.query(
        `INSERT INTO suspension_history (target_type, target_id, action, reason)
         VALUES ($1, $2, $3, $4)`,
        ['service', id, 'expire', 'Temporary service suspension expired automatically']
      );

      // Notify owner
      const notifTitle = "Service Listing Restored";
      const notifMessage = `Your service listing "${service.title}" has been restored automatically.`;
      await pool.query(
        `INSERT INTO user_notifications (user_id, title, message, item_type, item_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [service.user_id, notifTitle, notifMessage, 'service', id, 'ACTIVE']
      );

      // Update local object
      service.status = 'Active';
      service.suspended_until = null;
    }
    
    res.status(200).json({ success: true, service });
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching service' });
  }
});

// Get Services by User Route
router.get('/users/:id/services', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM services WHERE user_id = $1 ORDER BY created_at DESC', [id]);
    res.status(200).json({ success: true, services: result.rows });
  } catch (error) {
    console.error('Error fetching user services:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching user services' });
  }
});

// Update Product Status
router.patch('/products/:id/status', verifyToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, quantity } = req.body;

    // Verify ownership
    const ownerCheck = await client.query('SELECT user_id FROM products WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      client.release();
      return res.status(403).json({ success: false, message: 'You can only modify your own listings.' });
    }
    
    // We start a transaction to make sure both updates succeed together
    await client.query('BEGIN');

    let result;
    if (status === 'Available') {
      const qty = quantity !== undefined && quantity !== null ? parseInt(quantity, 10) : 1;
      result = await client.query(
        'UPDATE products SET status = $1, quantity = $2 WHERE id = $3 RETURNING *',
        [status, qty, id]
      );
      
      await client.query(
        `INSERT INTO inventory (item_type, item_id, available_quantity) 
         VALUES ('product', $1, $2) 
         ON CONFLICT (item_type, item_id) 
         DO UPDATE SET available_quantity = EXCLUDED.available_quantity`,
         [id, qty]
      );
    } else {
      result = await client.query(
        'UPDATE products SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
      
      if (status === 'Sold') {
        await client.query(
          `INSERT INTO inventory (item_type, item_id, available_quantity) 
           VALUES ('product', $1, 0) 
           ON CONFLICT (item_type, item_id) 
           DO UPDATE SET available_quantity = EXCLUDED.available_quantity`,
          [id]
        );
      }
    }

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await client.query('COMMIT');

    if (status === 'Available' && result.rows[0].quantity > 0) {
      await triggerRestockNotifications(id, result.rows[0].title, result.rows[0].quantity, req.app.get('io'), pool);
    }

    res.status(200).json({ success: true, product: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating product status:', error);
    res.status(500).json({ success: false, message: 'Server Error updating product status' });
  } finally {
    client.release();
  }
});

// Delete Product
router.delete('/products/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerCheck = await pool.query('SELECT user_id FROM products WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own listings.' });
    }
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Server Error deleting product' });
  }
});

// Update Skill Status
router.patch('/skills/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const ownerCheck = await pool.query('SELECT user_id FROM skills WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only modify your own listings.' });
    }
    const result = await pool.query(
      'UPDATE skills SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    res.status(200).json({ success: true, skill: result.rows[0] });
  } catch (error) {
    console.error('Error updating skill status:', error);
    res.status(500).json({ success: false, message: 'Server Error updating skill status' });
  }
});

// Delete Skill
router.delete('/skills/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerCheck = await pool.query('SELECT user_id FROM skills WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own listings.' });
    }
    await pool.query('DELETE FROM skills WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ success: false, message: 'Server Error deleting skill' });
  }
});

// Update Service Status
router.patch('/services/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const ownerCheck = await pool.query('SELECT user_id FROM services WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only modify your own listings.' });
    }
    const result = await pool.query(
      'UPDATE services SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    res.status(200).json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('Error updating service status:', error);
    res.status(500).json({ success: false, message: 'Server Error updating service status' });
  }
});

// Delete Service
router.delete('/services/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerCheck = await pool.query('SELECT user_id FROM services WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own listings.' });
    }
    await pool.query('DELETE FROM services WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ success: false, message: 'Server Error deleting service' });
  }
});

// Update Product
router.put('/products/:id', verifyToken, upload.array('images', 4), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { title, description, price, condition, category, quantity, existingImages } = req.body;

    // Verify ownership
    const ownerCheck = await client.query('SELECT user_id, quantity, status FROM products WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      client.release();
      return res.status(403).json({ success: false, message: 'You can only edit your own listings.' });
    }
    const prevQty = ownerCheck.rows[0].quantity;
    const prevStatus = ownerCheck.rows[0].status;
    
    let imageUrls = existingImages ? JSON.parse(existingImages) : [];
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => fileToBase64(file)).filter(Boolean);
      imageUrls = [...imageUrls, ...newImages];
    }

    const qty = quantity !== undefined && quantity !== null ? parseInt(quantity, 10) : 1;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE products 
       SET title = $1, description = $2, price = $3, condition = $4, category = $5, image_urls = $6, quantity = $7
       WHERE id = $8 RETURNING *`,
      [title, description, price, condition, category, imageUrls, qty, id]
    );

    await client.query(
      `INSERT INTO inventory (item_type, item_id, available_quantity) 
       VALUES ('product', $1, $2) 
       ON CONFLICT (item_type, item_id) 
       DO UPDATE SET available_quantity = EXCLUDED.available_quantity`,
      [id, qty]
    );

    let updatedProduct = result.rows[0];
    if (qty > 0 && prevStatus === 'Sold') {
      const statusUpdateRes = await client.query(
        "UPDATE products SET status = 'Available' WHERE id = $1 RETURNING *",
        [id]
      );
      updatedProduct = statusUpdateRes.rows[0];
    }

    await client.query('COMMIT');

    // Trigger restock notifications if quantity is now positive and it was previously out of stock or marked as Sold
    if (qty > 0 && (prevQty <= 0 || prevStatus === 'Sold')) {
      await triggerRestockNotifications(id, updatedProduct.title, qty, req.app.get('io'), pool);
    }

    res.status(200).json({ success: true, product: updatedProduct });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Server Error updating product' });
  } finally {
    client.release();
  }
});

// Update Skill
router.put('/skills/:id', verifyToken, upload.fields([{ name: 'images', maxCount: 4 }, { name: 'demoMedia', maxCount: 4 }]), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const ownerCheck = await pool.query('SELECT user_id FROM skills WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own listings.' });
    }

    const { 
      title, description, category, chargeType, availableTimeSlot, hourlyRate, skillType, existingImages,
      experienceLevel, prevExperience, sessionTypes, learningOutcomes, topicsCovered, languagesKnown, dayAvailability, portfolioLinks, existingDemoMedia
    } = req.body;
    const rate = chargeType === 'Paid' ? parseFloat(hourlyRate || 0) : 0;
    const sType = skillType || 'Online';
    
    let imageUrls = existingImages ? JSON.parse(existingImages) : [];
    if (req.files && req.files.images && req.files.images.length > 0) {
      const newImages = req.files.images.map(file => fileToBase64(file)).filter(Boolean);
      imageUrls = [...imageUrls, ...newImages];
    }

    let demoMediaUrls = existingDemoMedia ? JSON.parse(existingDemoMedia) : [];
    if (req.files && req.files.demoMedia && req.files.demoMedia.length > 0) {
      const newDemos = req.files.demoMedia.map(file => fileToBase64(file)).filter(Boolean);
      demoMediaUrls = [...demoMediaUrls, ...newDemos];
    }

    let parsedPortfolioLinks = null;
    if (portfolioLinks) {
      try {
        parsedPortfolioLinks = typeof portfolioLinks === 'string' ? JSON.parse(portfolioLinks) : portfolioLinks;
      } catch (err) {
        console.error('Error parsing portfolio links:', err);
      }
    }

    const result = await pool.query(
      `UPDATE skills 
       SET title = $1, description = $2, category = $3, charge_type = $4, available_time_slot = $5, hourly_rate = $6, skill_type = $7, image_urls = $8,
           experience_level = $9, prev_experience = $10, session_types = $11, learning_outcomes = $12, topics_covered = $13, languages_known = $14,
           day_availability = $15, portfolio_links = $16, demo_media = $17, status = $18, rejection_reason = $19
       WHERE id = $20 RETURNING *`,
      [
        title, description, category, chargeType, availableTimeSlot, rate, sType, imageUrls,
        experienceLevel || null, prevExperience || null, sessionTypes || null, learningOutcomes || null,
        topicsCovered || null, languagesKnown || null, dayAvailability || null, parsedPortfolioLinks, demoMediaUrls,
        'Pending Verification', null, id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Skill not found' });
    }
    res.status(200).json({ success: true, skill: result.rows[0] });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ success: false, message: 'Server Error updating skill' });
  }
});

// Update Service
router.put('/services/:id', verifyToken, upload.array('images', 4), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const ownerCheck = await pool.query('SELECT user_id FROM services WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own listings.' });
    }

    const { title, description, serviceType, standardPlan, groupPlan, existingImages } = req.body;
    
    let imageUrls = existingImages ? JSON.parse(existingImages) : [];
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => fileToBase64(file)).filter(Boolean);
      imageUrls = [...imageUrls, ...newImages];
    }

    const result = await pool.query(
      `UPDATE services 
       SET title = $1, description = $2, service_type = $3, standard_plan = $4, group_plan = $5, image_urls = $6
       WHERE id = $7 RETURNING *`,
      [title, description, serviceType, standardPlan ? parseFloat(standardPlan) : null, groupPlan ? parseFloat(groupPlan) : null, imageUrls, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.status(200).json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ success: false, message: 'Server Error updating service' });
  }
});

// Helper function to trigger restock notifications
async function triggerRestockNotifications(productId, productTitle, qty, io, dbPool) {
  try {
    // 1. Get all users who requested notification for this product
    const notifyReqs = await dbPool.query(
      'SELECT user_id FROM notify_requests WHERE product_id = $1',
      [productId]
    );

    if (notifyReqs.rows.length === 0) return;

    const userIds = notifyReqs.rows.map(r => r.user_id);
    const message = `Good news! The product "${productTitle}" is back in stock. ${qty} item(s) are now available.`;

    // 2. Insert restock notification records
    const insertValues = [];
    const valueParams = [];
    userIds.forEach((uid, index) => {
      const offset = index * 4;
      valueParams.push(uid, productId, 'Product Restocked', message);
      insertValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    });

    await dbPool.query(
      `INSERT INTO restock_notifications (user_id, product_id, title, message) VALUES ${insertValues.join(', ')}`,
      valueParams
    );

    // 3. Delete notify_requests records for this product
    await dbPool.query(
      'DELETE FROM notify_requests WHERE product_id = $1',
      [productId]
    );

    // 4. Broadcast to user rooms via Socket.io
    if (io) {
      userIds.forEach(uid => {
        io.to(`user_${uid}`).emit('new_restock_notification', {
          product_id: productId,
          title: 'Product Restocked',
          message: message
        });
      });
    }
    console.log(`Triggered restock notifications for product ${productId} to ${userIds.length} users.`);
  } catch (err) {
    console.error('Error triggering restock notifications:', err);
  }
}

// POST /api/products/:id/notify
router.post('/products/:id/notify', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if the product exists
    const prodCheck = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (prodCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Insert into notify_requests
    await pool.query(
      'INSERT INTO notify_requests (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING',
      [userId, id]
    );

    res.status(200).json({ success: true, message: 'Notification request saved successfully.' });
  } catch (error) {
    console.error('Error adding notify request:', error);
    res.status(500).json({ success: false, message: 'Server Error setting restock notification' });
  }
});

// GET /api/notifications
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT rn.id, rn.user_id, rn.product_id, rn.title, rn.message, rn.created_at,
              p.title as product_title, p.price as product_price, p.image_urls,
              u.first_name as seller_first_name, u.last_name as seller_last_name,
              u.profile_image as seller_profile_image
       FROM restock_notifications rn
       JOIN products p ON rn.product_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE rn.user_id = $1
       ORDER BY rn.created_at DESC`,
      [userId]
    );

    const generalResult = await pool.query(
      `SELECT * FROM user_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.status(200).json({ 
      success: true, 
      notifications: result.rows,
      generalNotifications: generalResult.rows
    });
  } catch (error) {
    console.error('Error fetching restock notifications:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching notifications' });
  }
});

module.exports = router;

