const pool = require('./db');

async function alterTable() {
  try {
    console.log('Adding status column to products table...');
    // We add IF NOT EXISTS equivalent for columns by checking first, or just try catch.
    // In postgres, ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Available';
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Available';`);
    console.log('Successfully added status column.');
  } catch (error) {
    console.error('Error altering table:', error.message);
  } finally {
    pool.end();
  }
}

alterTable();
