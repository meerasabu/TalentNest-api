const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/reviews - Submit a new review
router.post('/', verifyToken, async (req, res) => {
  try {
    const { 
      reviewedId, orderId, rating, reviewText,
      communicationRating, teachingRating, outcomeRating 
    } = req.body;
    const reviewerId = req.user.id;

    if (!reviewedId || !orderId || !rating) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Verify order exists, has Completed status, and current user is the buyer
    const orderRes = await pool.query(
      'SELECT status, item_id, item_type, buyer_id FROM orders WHERE id = $1',
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    const order = orderRes.rows[0];
    if (order.status !== 'Completed') {
      return res.status(400).json({ success: false, message: 'Reviews are only allowed for completed orders.' });
    }
    if (order.buyer_id !== reviewerId) {
      return res.status(403).json({ success: false, message: 'Only the buyer can review this order.' });
    }

    // Check if review already exists for this order
    const existing = await pool.query('SELECT id FROM reviews WHERE order_id = $1', [orderId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this order.' });
    }

    const result = await pool.query(
      `INSERT INTO reviews (
        reviewer_id, reviewed_id, order_id, item_id, item_type, rating, review_text, 
        communication_rating, teaching_rating, outcome_rating
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        reviewerId, reviewedId, orderId, order.item_id, order.item_type, rating, reviewText,
        communicationRating || null, teachingRating || null, outcomeRating || null
      ]
    );

    res.status(201).json({ success: true, review: result.rows[0] });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/reviews/user/:userId - Get all reviews for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT r.*, u.first_name, u.last_name, u.profile_image 
      FROM reviews r 
      JOIN users u ON r.reviewer_id = u.id 
      WHERE r.reviewed_id = $1 
      ORDER BY r.created_at DESC
    `, [userId]);

    res.status(200).json({ success: true, reviews: result.rows });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/reviews/product/:productId - Get reviews for a specific product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await pool.query(`
      SELECT 
        r.id, r.rating, r.review_text, r.created_at,
        r.communication_rating, r.teaching_rating, r.outcome_rating,
        u.first_name, u.last_name, u.profile_image
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.item_id = $1 AND r.item_type = 'product'
      ORDER BY r.created_at DESC
    `, [productId]);

    res.status(200).json({ success: true, reviews: result.rows });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/reviews/skill/:skillId - Get reviews for a specific skill
router.get('/skill/:skillId', async (req, res) => {
  try {
    const { skillId } = req.params;

    const result = await pool.query(`
      SELECT 
        r.id, r.rating, r.review_text, r.created_at,
        r.communication_rating, r.teaching_rating, r.outcome_rating,
        u.first_name, u.last_name, u.profile_image
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.item_id = $1 AND r.item_type = 'skill'
      ORDER BY r.created_at DESC
    `, [skillId]);

    res.status(200).json({ success: true, reviews: result.rows });
  } catch (error) {
    console.error('Error fetching skill reviews:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// GET /api/reviews/service/:serviceId - Get reviews for a specific service
router.get('/service/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;

    const result = await pool.query(`
      SELECT 
        r.id, r.rating, r.review_text, r.created_at,
        r.communication_rating, r.teaching_rating, r.outcome_rating,
        u.first_name, u.last_name, u.profile_image
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.item_id = $1 AND r.item_type = 'service'
      ORDER BY r.created_at DESC
    `, [serviceId]);

    res.status(200).json({ success: true, reviews: result.rows });
  } catch (error) {
    console.error('Error fetching service reviews:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
