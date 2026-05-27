const pool = require('./db');

const addCategory = async () => {
  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);`);
    console.log('Successfully added category column to products table.');
  } catch (err) {
    console.error('Error modifying tables:', err);
  } finally {
    pool.end();
  }
};

addCategory();
