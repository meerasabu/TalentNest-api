const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'talentNest',
  password: 'Meera@2001',
  port: 5432,
});

async function test() {
  try {
    const passwordHash = await bcrypt.hash('password123', 10);
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, department, graduation_year, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email, department, graduation_year`,
      ['Sneha', 'Santhosh', '24mcab59@kristujayanti.com', 'Department of CS (PG)', '2024', passwordHash]
    );
    console.log('Success:', result.rows[0]);
  } catch (err) {
    console.log('Error:', err.message);
  }
  pool.end();
}
test();
