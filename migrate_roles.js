const pool = require('./db');

const migrateRoles = async () => {
  try {
    console.log('Adding role column to users table...');
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';`);
    console.log('Successfully added role column.');
  } catch (err) {
    console.error('Error adding role column:', err);
  } finally {
    pool.end();
  }
};

migrateRoles();
