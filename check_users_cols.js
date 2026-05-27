const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

async function check() {
  try {
    const users = await pool.query("SELECT * FROM users LIMIT 1");
    console.log("Users columns:", Object.keys(users.rows[0] || {}));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

check();
