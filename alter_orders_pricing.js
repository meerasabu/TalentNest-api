const pool = require('./db');

const migrate = async () => {
  try {
    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS selected_plan_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS selected_price VARCHAR(50);
    `);
    console.log('Orders table successfully altered to support service pricing plans.');
  } catch (err) {
    console.error('Error altering orders table:', err);
  } finally {
    pool.end();
  }
};

migrate();
