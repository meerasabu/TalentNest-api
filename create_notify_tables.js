const pool = require('./db');

const createNotifyTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create notify_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notify_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );
    `);

    // 2. Create restock_notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS restock_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        title VARCHAR(255) DEFAULT 'Product Restocked',
        message VARCHAR(255) NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
    console.log('Notification tables created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating notification tables:', err);
  } finally {
    client.release();
    pool.end();
  }
};

createNotifyTables();
