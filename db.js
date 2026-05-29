// db.js
const { Pool } = require('pg');
require('dotenv').config();

// Determine if we are running in production
const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = {};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
} else {
  poolConfig.user = process.env.DB_USER || 'postgres';
  poolConfig.host = process.env.DB_HOST || 'localhost';
  poolConfig.database = process.env.DB_NAME || 'talentNest';
  poolConfig.password = String(process.env.DB_PASSWORD || '');
  poolConfig.port = parseInt(process.env.DB_PORT || '5432', 10);
}

// Automatically enforces SSL on Vercel/Neon, but allows unencrypted connections on localhost
if (isProduction || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech'))) {
  poolConfig.ssl = { rejectUnauthorized: false };
} else {
  poolConfig.ssl = false;
}

const pool = new Pool(poolConfig);

module.exports = pool;