const pool = require('./db');

const createReportsTable = async () => {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id INT REFERENCES users(id) ON DELETE CASCADE,
        reported_id INT REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(query);
    console.log("Reports table created successfully.");
  } catch (error) {
    console.error("Error creating reports table:", error);
  } finally {
    pool.end();
  }
};

createReportsTable();
