// db.js
const { Pool } = require('pg');
require('dotenv').config();

// Determine if we are running in production
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Automatically enforces SSL on Vercel, but allows unencrypted connections on localhost
  ssl: isProduction
    ? { rejectUnauthorized: false }
    : false
});

module.exports = pool;