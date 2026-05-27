const pool = require('./db');

async function migrate() {
  try {
    console.log('Adding status column to skills table...');
    await pool.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';`);
    
    console.log('Adding status column to services table...');
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';`);
    
    console.log('Database migration complete.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    pool.end();
  }
}

migrate();
