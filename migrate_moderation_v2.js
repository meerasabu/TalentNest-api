const pool = require('./db');

const migrateModerationV2 = async () => {
  try {
    console.log('Running moderation v2 migrations...');

    // 1. Add chat_id column to reports table
    console.log('Adding chat_id column to reports...');
    await pool.query(`
      ALTER TABLE reports 
      ADD COLUMN IF NOT EXISTS chat_id INT REFERENCES chats(chat_id) ON DELETE SET NULL;
    `);

    // 2. Add suspended_until column to users table
    console.log('Adding suspended_until column to users...');
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
    `);

    // 3. Create admin_action_history table
    console.log('Creating admin_action_history table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_action_history (
        id SERIAL PRIMARY KEY,
        admin_id INT REFERENCES users(id) ON DELETE SET NULL,
        report_id INT REFERENCES reports(id) ON DELETE SET NULL,
        action_taken VARCHAR(100) NOT NULL,
        action_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Moderation v2 migrations completed successfully.');
  } catch (err) {
    console.error('Error running moderation v2 migrations:', err);
  } finally {
    pool.end();
  }
};

migrateModerationV2();
