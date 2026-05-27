const pool = require('./db');

const patchUsersOtp = async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp VARCHAR(6);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires_at TIMESTAMP;`);
    
    console.log('Successfully added OTP columns to the users table.');
  } catch (err) {
    console.error('Error modifying users table with OTP columns:', err);
  } finally {
    pool.end();
  }
};

patchUsersOtp();
