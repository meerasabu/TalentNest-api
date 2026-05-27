const pool = require('./db');

const run = async () => {
  try {
    // Insert an order directly to test the database and schema
    const buyerId = 6;
    const sellerId = 5;
    const itemType = 'service';
    const itemId = 3;
    const selectedPlanType = 'Group/Premium Plan';
    const selectedPrice = '500';

    const result = await pool.query(
      'INSERT INTO orders (buyer_id, seller_id, item_type, item_id, status, quantity, selected_plan_type, selected_price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [buyerId, sellerId, itemType, itemId, 'Pending', 1, selectedPlanType, selectedPrice]
    );

    console.log('Inserted Order:', result.rows[0]);

    // Let's test the populateOrderDetails logic
    // We can simulate fetching the order through the GET route
    const getRes = await pool.query(
      `SELECT o.id, o.item_type, o.item_id, o.status, o.created_at, o.updated_at, o.quantity,
              o.selected_plan_type, o.selected_price,
              u.first_name as seller_first_name, u.last_name as seller_last_name
       FROM orders o
       JOIN users u ON o.seller_id = u.id
       WHERE o.id = $1`,
      [result.rows[0].id]
    );

    console.log('Fetched Order:', getRes.rows[0]);
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    pool.end();
  }
};

run();
