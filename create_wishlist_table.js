const pool = require('./db');

const createWishlistTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        item_type VARCHAR(50) NOT NULL,
        item_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_type, item_id)
      )
    `);
    console.log('Wishlist table created successfully.');
  } catch (err) {
    console.error('Error creating wishlist table:', err);
  } finally {
    pool.end();
  }
};

createWishlistTable();
