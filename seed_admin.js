const pool = require('./db');
const bcrypt = require('bcrypt');

const seedAdmin = async () => {
  try {
    const email = 'admin@kristujayanti.com';
    const password = 'Admin@123';
    
    // Check if admin already exists
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log('Admin user already exists.');
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      ['Campus', 'Admin', email, hash, 'admin']
    );

    console.log('Successfully seeded admin user: admin@kristujayanti.com');
  } catch (err) {
    console.error('Error seeding admin user:', err);
  } finally {
    pool.end();
  }
};

seedAdmin();
