const pool = require('./db');

const patchUsersTable = async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS campus_location VARCHAR(100);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_image VARCHAR(255);`);
    
    console.log('Successfully expanded users table with profile properties.');
  } catch (err) {
    console.error('Error modifying users table:', err);
  } finally {
    pool.end();
  }
};

patchUsersTable();
