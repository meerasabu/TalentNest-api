const pool = require('./db');

const patchReviewsTable = async () => {
  try {
    console.log('Adding item_id and item_type to reviews table...');
    await pool.query(`
      ALTER TABLE reviews 
      ADD COLUMN IF NOT EXISTS item_id INT,
      ADD COLUMN IF NOT EXISTS item_type VARCHAR(50);
    `);
    console.log('Columns added successfully.');

    console.log('Backpopulating item_id and item_type from orders table...');
    const updateResult = await pool.query(`
      UPDATE reviews r 
      SET item_id = o.item_id, item_type = o.item_type 
      FROM orders o 
      WHERE r.order_id = o.id;
    `);
    console.log(`Backpopulated ${updateResult.rowCount} rows.`);

    // Check if there are any reviews left with null item_id or item_type
    const checkNull = await pool.query('SELECT COUNT(*) FROM reviews WHERE item_id IS NULL OR item_type IS NULL');
    const nullCount = parseInt(checkNull.rows[0].count, 10);
    if (nullCount === 0) {
      console.log('Setting NOT NULL constraints on item_id and item_type...');
      await pool.query(`
        ALTER TABLE reviews 
        ALTER COLUMN item_id SET NOT NULL,
        ALTER COLUMN item_type SET NOT NULL;
      `);
      console.log('NOT NULL constraints applied.');
    } else {
      console.warn(`Warning: There are ${nullCount} reviews without matching orders. Cannot set NOT NULL constraint.`);
    }

    console.log('Review table patch complete.');
  } catch (err) {
    console.error('Error patching reviews table:', err);
  } finally {
    pool.end();
  }
};

patchReviewsTable();
