const pool = require('./db');

const upgradeReviewsSchema = async () => {
  try {
    console.log('Altering reviews table to add advanced rating columns...');
    await pool.query(`
      ALTER TABLE reviews 
      ADD COLUMN IF NOT EXISTS communication_rating INT CHECK (communication_rating >= 1 AND communication_rating <= 5),
      ADD COLUMN IF NOT EXISTS teaching_rating INT CHECK (teaching_rating >= 1 AND teaching_rating <= 5),
      ADD COLUMN IF NOT EXISTS outcome_rating INT CHECK (outcome_rating >= 1 AND outcome_rating <= 5);
    `);
    console.log('Reviews table upgraded successfully.');
  } catch (err) {
    console.error('Error during database reviews schema upgrade:', err);
  } finally {
    pool.end();
  }
};

upgradeReviewsSchema();
