const pool = require('./db');

async function check() {
  try {
    const result = await pool.query(`
      SELECT 
        c.chat_id, c.order_id, c.created_at, c.status as chat_status,
        o.item_type, o.item_id, o.status as order_status,
        CASE 
          WHEN c.buyer_id = $1 THEN seller.id 
          ELSE buyer.id 
        END AS partner_id,
        CASE 
          WHEN c.buyer_id = $1 THEN seller.first_name || ' ' || seller.last_name
          ELSE buyer.first_name || ' ' || buyer.last_name
        END AS partner_name,
        CASE 
          WHEN c.buyer_id = $1 THEN seller.profile_image
          ELSE buyer.profile_image
        END AS partner_image
      FROM chats c
      JOIN orders o ON c.order_id = o.id
      JOIN users buyer ON c.buyer_id = buyer.id
      JOIN users seller ON c.seller_id = seller.id
      WHERE c.buyer_id = $1 OR c.seller_id = $1
      ORDER BY c.created_at DESC
    `, [6]);
    console.log(result.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
