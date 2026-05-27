const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/authMiddleware');

// Add item to wishlist
router.post('/', verifyToken, async (req, res) => {
  try {
    const { userId, itemType, itemId } = req.body;
    
    if (!userId || !itemType || !itemId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Insert into wishlist (handle duplicates gracefully by catching unique constraint error)
    try {
      const result = await pool.query(
        'INSERT INTO wishlist (user_id, item_type, item_id) VALUES ($1, $2, $3) RETURNING *',
        [userId, itemType, itemId]
      );
      res.status(201).json({ success: true, wishlistItem: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') { // Unique violation
        return res.status(200).json({ success: true, message: 'Item already in wishlist' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, message: 'Server Error handling wishlist addition' });
  }
});

// Remove item from wishlist
router.delete('/:userId/:itemType/:itemId', verifyToken, async (req, res) => {
  try {
    const { userId, itemType, itemId } = req.params;
    
    await pool.query(
      'DELETE FROM wishlist WHERE user_id = $1 AND item_type = $2 AND item_id = $3',
      [userId, itemType, itemId]
    );
    
    res.status(200).json({ success: true, message: 'Item removed from wishlist' });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ success: false, message: 'Server Error removing wishlist item' });
  }
});

// Get all wishlist items for a user
router.get('/users/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // We fetch wishlist records
    const result = await pool.query(
      'SELECT id as wishlist_id, item_type, item_id FROM wishlist WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const wishlistItems = result.rows;
    if (wishlistItems.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    // Since items are stored in different tables, we'll run separate queries or a UNION. 
    // Given the structure, querying each table using the IDs is straightforward.
    const productIds = wishlistItems.filter(item => item.item_type === 'product').map(item => item.item_id);
    const skillIds = wishlistItems.filter(item => item.item_type === 'skill').map(item => item.item_id);
    const serviceIds = wishlistItems.filter(item => item.item_type === 'service').map(item => item.item_id);

    let products = [];
    if (productIds.length > 0) {
      const pRes = await pool.query(`
        SELECT products.*, COALESCE(inventory.available_quantity, 0) as available_quantity
        FROM products
        LEFT JOIN inventory ON inventory.item_id = products.id AND inventory.item_type = 'product'
        WHERE products.id = ANY($1::int[])
      `, [productIds]);
      products = pRes.rows.map(p => ({ ...p, item_type: 'product' }));
    }

    let skills = [];
    if (skillIds.length > 0) {
      const sRes = await pool.query('SELECT * FROM skills WHERE id = ANY($1::int[])', [skillIds]);
      skills = sRes.rows.map(s => ({ ...s, item_type: 'skill' }));
    }

    let services = [];
    if (serviceIds.length > 0) {
      const srvRes = await pool.query('SELECT * FROM services WHERE id = ANY($1::int[])', [serviceIds]);
      services = srvRes.rows.map(s => ({ ...s, item_type: 'service' }));
    }

    // Combine and map back to the ordered wishlist
    const allFetchedItems = [...products, ...skills, ...services];
    
    const populatedWishlist = wishlistItems.map(wishItem => {
      const details = allFetchedItems.find(i => i.item_type === wishItem.item_type && i.id === wishItem.item_id);
      return {
        wishlist_id: wishItem.wishlist_id,
        type: wishItem.item_type,
        id: wishItem.item_id, // The item's actual ID
        title: details?.title,
        category: details?.category || details?.service_type,
        price: details?.price || details?.hourly_rate || details?.standard_plan,
        image_url: details?.image_urls && details.image_urls.length > 0 ? details.image_urls[0] : null,
        status: details?.status === 'Sold' ? 'SOLD' : (details?.item_type === 'product' && (details?.available_quantity === 0 || details?.available_quantity == null) ? 'OUT OF STOCK' : (details?.status || 'Available')),
        details: details // Full details if needed
      };
    }).filter(item => item.details != null); // filter out items that might have been deleted but are still in wishlist

    res.status(200).json({ success: true, items: populatedWishlist });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ success: false, message: 'Server Error fetching wishlist' });
  }
});

module.exports = router;
