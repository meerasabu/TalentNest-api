const pool = require('./db');

const createReviewsTable = async () => {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        reviewer_id INT REFERENCES users(id) ON DELETE CASCADE,
        reviewed_id INT REFERENCES users(id) ON DELETE CASCADE,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        rating INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
        review_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(query);
    console.log("Reviews table created successfully.");
  } catch (error) {
    console.error("Error creating reviews table:", error);
  } finally {
    pool.end();
  }
};

createReviewsTable();
