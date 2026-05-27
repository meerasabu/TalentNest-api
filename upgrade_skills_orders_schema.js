const pool = require('./db');

const upgradeSchema = async () => {
  try {
    console.log('Altering skills table to add peer-learning trusted system columns...');
    await pool.query(`
      ALTER TABLE skills 
      ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50),
      ADD COLUMN IF NOT EXISTS prev_experience TEXT,
      ADD COLUMN IF NOT EXISTS session_types TEXT,
      ADD COLUMN IF NOT EXISTS learning_outcomes TEXT,
      ADD COLUMN IF NOT EXISTS topics_covered TEXT,
      ADD COLUMN IF NOT EXISTS languages_known VARCHAR(255),
      ADD COLUMN IF NOT EXISTS day_availability VARCHAR(255),
      ADD COLUMN IF NOT EXISTS portfolio_links JSONB,
      ADD COLUMN IF NOT EXISTS demo_media TEXT[];
    `);
    console.log('Skills table upgraded successfully.');

    console.log('Altering orders table to add session request verification columns...');
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS learning_goal TEXT,
      ADD COLUMN IF NOT EXISTS preferred_schedule VARCHAR(255),
      ADD COLUMN IF NOT EXISTS user_skill_level VARCHAR(50);
    `);
    console.log('Orders table upgraded successfully.');

  } catch (err) {
    console.error('Error during database schema upgrade:', err);
  } finally {
    pool.end();
  }
};

upgradeSchema();
