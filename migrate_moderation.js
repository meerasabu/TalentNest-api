const pool = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add rejection_reason column to skills table if it doesn't exist
    console.log("Adding rejection_reason column to skills table if not exists...");
    await client.query(`
      ALTER TABLE skills 
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);

    // 2. Modify default status of skills table to 'Pending Verification'
    console.log("Altering skills status default value to 'Pending Verification'...");
    await client.query(`
      ALTER TABLE skills 
      ALTER COLUMN status SET DEFAULT 'Pending Verification'
    `);

    // 3. Create user_notifications table
    console.log("Creating user_notifications table if not exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        item_type VARCHAR(50) NOT NULL,
        item_id INTEGER,
        status VARCHAR(50),
        rejection_reason TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

migrate();
