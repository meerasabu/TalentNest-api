const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/dashboard/overview - Fetch recent items for user dashboard
router.get('/overview', verifyToken, async (req, res) => {
  console.log('Fetching dashboard overview...');
  try {
    // 1. Fetch 3 most recent products
    const productsRes = await pool.query(`
      SELECT p.*, u.first_name, u.last_name, u.profile_image,
             COALESCE(avg_rev.avg_rating, 0.0) as rating,
             COALESCE(avg_rev.review_count, 0) as reviews
      FROM products p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN (
        SELECT 
          o.item_id,
          ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
          COUNT(r.id) as review_count
        FROM reviews r
        JOIN orders o ON r.order_id = o.id
        WHERE o.item_type = 'product'
        GROUP BY o.item_id
      ) avg_rev ON avg_rev.item_id = p.id
      ORDER BY p.created_at DESC
      LIMIT 3
    `);

    // 2. Fetch 2 most recent services
    const servicesRes = await pool.query(`
      SELECT s.*, u.first_name, u.last_name 
      FROM services s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 2
    `);

    // 3. Fetch 2 most recent skills
    const skillsRes = await pool.query(`
      SELECT sk.*, u.first_name, u.last_name 
      FROM skills sk
      JOIN users u ON sk.user_id = u.id
      ORDER BY sk.created_at DESC
      LIMIT 2
    `);

    // 4. Fetch 3 most recent order activities for this user
    const userId = req.user.id;
    const activitiesRes = await pool.query(`
      SELECT o.*, 
             u_seller.first_name as seller_first_name, u_seller.last_name as seller_last_name,
             u_buyer.first_name as buyer_first_name, u_buyer.last_name as buyer_last_name,
             p.title as product_title, sk.title as skill_title, srv.title as service_title
      FROM orders o
      LEFT JOIN users u_seller ON o.seller_id = u_seller.id
      LEFT JOIN users u_buyer ON o.buyer_id = u_buyer.id
      LEFT JOIN products p ON o.item_type = 'product' AND o.item_id = p.id
      LEFT JOIN skills sk ON o.item_type = 'skill' AND o.item_id = sk.id
      LEFT JOIN services srv ON o.item_type = 'service' AND o.item_id = srv.id
      WHERE o.buyer_id = $1 OR o.seller_id = $1
      ORDER BY o.updated_at DESC
      LIMIT 3
    `, [userId]);

    res.json({
      success: true,
      products: productsRes.rows,
      services: servicesRes.rows,
      skills: skillsRes.rows,
      activities: activitiesRes.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
