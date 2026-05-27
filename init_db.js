const pool = require('./db');

const createUsersTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(100),
        graduation_year INTEGER,
        password_hash VARCHAR(255) NOT NULL
    );
  `;
  try {
    await pool.query(query);
    console.log("Users table created successfully.");
  } catch (err) {
    console.error("Error creating table: ", err);
  } finally {
    pool.end();
  }
};

createUsersTable();
