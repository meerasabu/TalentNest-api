const pool = require('./db');

async function checkSchema() {
  try {
    // Check services columns
    const svcCols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'services' ORDER BY column_name`
    );
    console.log('services columns:', svcCols.rows.map(r => r.column_name).join(', '));

    // Check suspension_history table
    const tbl = await pool.query(`SELECT to_regclass('public.suspension_history')`);
    console.log('suspension_history table exists:', tbl.rows[0].to_regclass);

    // Check user_notifications table
    const notif = await pool.query(`SELECT to_regclass('public.user_notifications')`);
    console.log('user_notifications table exists:', notif.rows[0].to_regclass);

    // Check users table for account_status column
    const userCols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_status'`
    );
    console.log('users.account_status exists:', userCols.rows.length > 0);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

checkSchema();
