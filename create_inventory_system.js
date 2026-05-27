const pool = require('./db');

const createInventorySystem = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add quantity column to products
    await client.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
    `);

    // 2. Add quantity column to orders
    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
    `);

    // 3. Create inventory table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        item_type VARCHAR(50) NOT NULL,
        item_id INTEGER NOT NULL,
        available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
        UNIQUE(item_type, item_id)
      );
    `);

    // 4. Backfill inventory for all existing products, skills, and services
    // For products, use their new quantity column (which defaulted to 1)
    await client.query(`
      INSERT INTO inventory (item_type, item_id, available_quantity)
      SELECT 'product', id, quantity FROM products
      ON CONFLICT (item_type, item_id) DO NOTHING;
    `);

    // For skills, default to 1 (or infinite if we wanted, but let's say 1 per session request for now)
    await client.query(`
      INSERT INTO inventory (item_type, item_id, available_quantity)
      SELECT 'skill', id, 1 FROM skills
      ON CONFLICT (item_type, item_id) DO NOTHING;
    `);

    // For services, default to 1
    await client.query(`
      INSERT INTO inventory (item_type, item_id, available_quantity)
      SELECT 'service', id, 1 FROM services
      ON CONFLICT (item_type, item_id) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Inventory system migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error migrating inventory system:', err);
  } finally {
    client.release();
  }
};

createInventorySystem();
