const pool = require('./db');

const migrateAccountStatus = async () => {
  try {
    console.log('Adding account_status column to users table...');
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) DEFAULT 'Active';`);
    console.log('Successfully added account_status column.');
  } catch (err) {
    console.error('Error adding account_status column:', err);
  } finally {
    pool.end();
  }
};

migrateAccountStatus();
