const pool = require('./db');

const createVerificationTable = async () => {
  try {
    // Drop table if exists for fresh demo/seeding (or CREATE TABLE IF NOT EXISTS)
    // We will use CREATE TABLE IF NOT EXISTS.
    const createQuery = `
      CREATE TABLE IF NOT EXISTS verification_requests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        badge_type VARCHAR(100) NOT NULL,
        department VARCHAR(100) NOT NULL,
        request_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        document_url VARCHAR(255) DEFAULT 'student_id.pdf',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createQuery);
    console.log("Verification requests table created successfully.");

    // Seed requests if empty
    const checkQuery = `SELECT COUNT(*) FROM verification_requests`;
    const countRes = await pool.query(checkQuery);
    const count = parseInt(countRes.rows[0].count, 10);

    if (count === 0) {
      console.log("Seeding verification requests...");
      const seedQuery = `
        INSERT INTO verification_requests (name, badge_type, department, request_date, status, document_url)
        VALUES 
          ('Michael Roberts', 'Verified Student', 'Business', '2026-05-02', 'Pending', 'student_id_roberts.pdf'),
          ('Jessica Liu', 'Trusted Seller', 'Media', '2026-05-01', 'Pending', 'seller_permit_liu.pdf'),
          ('Alex Brown', 'Skill Mentor', 'Computer Science', '2026-04-30', 'Approved', 'academic_transcript_brown.pdf')
      `;
      await pool.query(seedQuery);
      console.log("Verification requests seeded successfully.");
    } else {
      console.log("Verification requests already has data. Skipping seed.");
    }

  } catch (error) {
    console.error("Error setting up verification table:", error);
  } finally {
    pool.end();
  }
};

createVerificationTable();
