const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// The Pool will use the environment variables automatically 
// if they are named PGUSER, PGHOST, PGPASSWORD, PGDATABASE, PGPORT
// But explicitly passing them is also fine and often clearer for beginners.
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
