const pool = require('./db');

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add booking_date as DATE type
    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS booking_date DATE;
    `);

    // Add booking_slot as VARCHAR
    await client.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS booking_slot VARCHAR(100);
    `);

    await client.query('COMMIT');
    console.log('Migration complete: booking_date (DATE) and booking_slot added to orders table.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
