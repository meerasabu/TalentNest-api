const pool = require('./db');

const patchTables = async () => {
  try {
    await pool.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS charge_type VARCHAR(50);`);
    await pool.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS available_time_slot VARCHAR(255);`);
    await pool.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_type VARCHAR(50) DEFAULT 'Online';`);
    
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS standard_plan NUMERIC;`);
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS group_plan NUMERIC;`);
    
    console.log('Successfully expanded DB properties conditionally targeting Skills/Services.');
  } catch (err) {
    console.error('Error modifying tables:', err);
  } finally {
    pool.end();
  }
};

patchTables();
