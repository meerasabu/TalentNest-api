const pool = require('./db');

const patchReportsTable = async () => {
  try {
    // Add columns if they don't exist
    await pool.query(`
      ALTER TABLE reports 
      ADD COLUMN IF NOT EXISTS item_id INT,
      ADD COLUMN IF NOT EXISTS item_type VARCHAR(50);
    `);

    // Add some sample reports for chat moderation demo
    // We assume users with IDs 1, 2, 3 exist
    const sampleReports = [
      { reporter: 1, reported: 2, reason: 'Inappropriate language', status: 'Flagged', item_id: 1, item_type: 'service' },
      { reporter: 3, reported: 1, reason: 'Suspicious payment request', status: 'Under Review', item_id: 2, item_type: 'product' }
    ];

    for (const report of sampleReports) {
      await pool.query(`
        INSERT INTO reports (reporter_id, reported_id, reason, status, item_id, item_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING;
      `, [report.reporter, report.reported, report.reason, report.status, report.item_id, report.item_type]);
    }

    console.log("Reports table patched and seeded.");
  } catch (error) {
    console.error("Error patching reports table:", error);
  } finally {
    pool.end();
  }
};

patchReportsTable();
