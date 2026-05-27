const pool = require('./db');
async function run() {
  try {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='admin_action_history' ORDER BY ordinal_position`
    );
    console.log('admin_action_history columns:', r.rows.map(x => x.column_name).join(', '));
    
    // Also check if warn_history table exists
    const t = await pool.query(`SELECT to_regclass('public.warn_history')`);
    console.log('warn_history table:', t.rows[0].to_regclass);
  } catch(e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
run();
