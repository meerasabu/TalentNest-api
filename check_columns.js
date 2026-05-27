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
    const skills = await pool.query("SELECT * FROM skills LIMIT 1");
    console.log("Skills columns:", Object.keys(skills.rows[0] || {}));
    const services = await pool.query("SELECT * FROM services LIMIT 1");
    console.log("Services columns:", Object.keys(services.rows[0] || {}));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

check();
