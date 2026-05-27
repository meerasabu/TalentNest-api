const pool = require('./db');

async function migrate() {
  try {
    console.log('Creating warn_history table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warn_history (
        id SERIAL PRIMARY KEY,
        target_type VARCHAR(50) NOT NULL,
        target_id INT NOT NULL,
        target_user_id INT REFERENCES users(id) ON DELETE SET NULL,
        admin_id INT REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('warn_history table created successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    pool.end();
  }
}

migrate();
