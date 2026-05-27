const pool = require('./db');

async function check() {
  try {
    const res = await pool.query("SELECT id, first_name, last_name, email, role, profile_image FROM users");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
