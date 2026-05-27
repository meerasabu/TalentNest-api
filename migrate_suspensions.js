const pool = require('./db');

const migrateSuspensions = async () => {
  try {
    console.log('Running suspensions migrations...');

    // 1. Add suspended_until column to services table
    console.log('Adding suspended_until column to services...');
    await pool.query(`
      ALTER TABLE services 
      ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
    `);

    // 2. Create suspension_history table with severity levels
    console.log('Creating suspension_history table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suspension_history (
        id SERIAL PRIMARY KEY,
        target_type VARCHAR(50) NOT NULL,
        target_id INT NOT NULL,
        admin_id INT REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        duration VARCHAR(50),
        suspended_until TIMESTAMP,
        reason TEXT,
        severity_level VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Suspension migrations completed successfully.');
  } catch (err) {
    console.error('Error running suspension migrations:', err);
  } finally {
    pool.end();
  }
};

migrateSuspensions();
