const pool = require('./db');

const migrateTables = async () => {
  try {
    // Migrate Products
    await pool.query(`
      ALTER TABLE products DROP COLUMN IF EXISTS image_url;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[];
    `);

    // Migrate Skills
    await pool.query(`
      ALTER TABLE skills DROP COLUMN IF EXISTS image_url;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS image_urls TEXT[];
    `);

    // Migrate Services
    await pool.query(`
      ALTER TABLE services DROP COLUMN IF EXISTS image_url;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS image_urls TEXT[];
    `);

    console.log('Successfully expanded image schema array across all tables.');
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    pool.end();
  }
};

migrateTables();
