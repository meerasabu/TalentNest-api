const pool = require('./db');

const addUserTimestamps = async () => {
  try {
    console.log('Adding created_at and profile_updated_at columns to users...');
    
    // Add created_at column
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Add profile_updated_at column
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP;
    `);

    // Add updated_at column to orders if it doesn't exist
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // Initialize profile_updated_at for existing users who already have a bio
    await pool.query(`
      UPDATE users 
      SET profile_updated_at = created_at 
      WHERE bio IS NOT NULL AND profile_updated_at IS NULL;
    `);

    console.log('Successfully added columns and initialized data.');
  } catch (err) {
    console.error('Error adding user timestamp columns:', err);
  } finally {
    pool.end();
  }
};

addUserTimestamps();
