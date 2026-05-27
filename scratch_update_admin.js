const pool = require('./db');
const bcrypt = require('bcrypt');

async function main() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('Admin@123', salt);

    const updateRes = await pool.query(
      `UPDATE users 
       SET password_hash = $1, role = 'admin' 
       WHERE email = 'admin@talentnest.com' 
       RETURNING id, email, role`,
      [hash]
    );

    console.log("Updated admin:", updateRes.rows);
  } catch (error) {
    console.error("Error updating admin password:", error);
  } finally {
    pool.end();
  }
}

main();
