const express = require('express');
const router = express.Router();
const pool = require('../db');

// Global Search Route
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const searchQuery = `%${q}%`;

    // Query Products
    const productsResult = await pool.query(`
      SELECT p.*, u.first_name, u.last_name, u.profile_image,
             COALESCE(avg_rev.avg_rating, 0.0) as rating,
             COALESCE(avg_rev.review_count, 0) as reviews
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
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
      WHERE p.title ILIKE $1 OR p.description ILIKE $1 OR p.category ILIKE $1
    `, [searchQuery]);

    // Query Skills
    const skillsResult = await pool.query(`
      SELECT s.*, u.first_name, u.last_name, u.profile_image 
      FROM skills s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE (s.title ILIKE $1 OR s.description ILIKE $1 OR s.category ILIKE $1) AND s.status = 'Active'
    `, [searchQuery]);

    // Query Services
    const servicesResult = await pool.query(`
      SELECT s.*, u.first_name, u.last_name, u.profile_image 
      FROM services s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.title ILIKE $1 OR s.description ILIKE $1 OR s.service_type ILIKE $1
    `, [searchQuery]);

    res.status(200).json({
      success: true,
      results: {
        products: productsResult.rows,
        skills: skillsResult.rows,
        services: servicesResult.rows
      }
    });
  } catch (error) {
    console.error('Error during search:', error);
    res.status(500).json({ success: false, message: 'Server error during search' });
  }
});

module.exports = router;
