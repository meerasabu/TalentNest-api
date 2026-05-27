const pool = require('./db');

const migrateSeverity = async () => {
  try {
    console.log('Running severity column migration...');

    // 1. Add severity column to reports table
    console.log('Adding severity column to reports...');
    await pool.query(`
      ALTER TABLE reports 
      ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'Medium';
    `);

    // 2. Classify existing reports based on keywords
    console.log('Classifying existing reports...');
    await pool.query(`
      UPDATE reports 
      SET severity = 'High'
      WHERE LOWER(reason) LIKE '%harass%' 
         OR LOWER(reason) LIKE '%abuse%'
         OR LOWER(reason) LIKE '%language%'
         OR LOWER(reason) LIKE '%coffee%';
    `);

    await pool.query(`
      UPDATE reports 
      SET severity = 'Critical'
      WHERE LOWER(reason) LIKE '%scam%' 
         OR LOWER(reason) LIKE '%cheat%'
         OR LOWER(reason) LIKE '%fraud%'
         OR LOWER(reason) LIKE '%fake%';
    `);

    await pool.query(`
      UPDATE reports 
      SET severity = 'Low'
      WHERE LOWER(reason) LIKE '%punctual%'
         OR LOWER(reason) LIKE '%late%'
         OR LOWER(reason) LIKE '%slow%';
    `);

    console.log('Severity column migration completed successfully.');
  } catch (err) {
    console.error('Error running severity column migration:', err);
  } finally {
    pool.end();
  }
};

migrateSeverity();
