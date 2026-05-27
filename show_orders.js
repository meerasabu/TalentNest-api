const pool = require('./db');

const run = async () => {
  try {
    const res = await pool.query('SELECT * FROM orders ORDER BY id DESC LIMIT 5');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
};

run();
