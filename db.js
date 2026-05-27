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

// Helper for running queries safely
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool // Exported in case you need direct pool access elsewhere
};