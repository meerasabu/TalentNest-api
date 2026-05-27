const pool = require('../db');
const bcrypt = require('bcryptjs');

const runMigrations = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Applying automated database migrations...');

    // 0. Ensure core tables exist before altering them
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id                  SERIAL PRIMARY KEY,
        buyer_id            INTEGER       REFERENCES users(id) ON DELETE CASCADE,
        seller_id           INTEGER       REFERENCES users(id) ON DELETE CASCADE,
        item_type           VARCHAR(50)   NOT NULL,
        item_id             INTEGER       NOT NULL,
        status              VARCHAR(50)   DEFAULT 'Pending',
        created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id           SERIAL PRIMARY KEY,
        reviewer_id  INTEGER  REFERENCES users(id)  ON DELETE CASCADE,
        reviewed_id  INTEGER  REFERENCES users(id)  ON DELETE CASCADE,
        order_id     INTEGER  REFERENCES orders(id) ON DELETE CASCADE,
        rating       INTEGER  NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review_text  TEXT,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id           SERIAL PRIMARY KEY,
        reporter_id  INTEGER      REFERENCES users(id) ON DELETE CASCADE,
        reported_id  INTEGER      REFERENCES users(id) ON DELETE CASCADE,
        reason       TEXT         NOT NULL,
        status       VARCHAR(50)  DEFAULT 'Pending',
        created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 1. Users Table Columns
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS campus_location VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_image TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) DEFAULT 'Active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp VARCHAR(6);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP;
    `);

    // 1b. Fix column types if they were created as VARCHAR(255) by older patches
    await client.query(`
      ALTER TABLE users ALTER COLUMN profile_image TYPE TEXT;
      ALTER TABLE users ALTER COLUMN banner_image TYPE TEXT;
    `);

    // 2. Products Table Columns
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[];
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Available';
    `);

    // 3. Skills Table Columns
    await client.query(`
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS image_urls TEXT[];
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending Verification';
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS charge_type VARCHAR(50);
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS available_time_slot VARCHAR(255);
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS skill_type VARCHAR(50) DEFAULT 'Online';
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50);
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS prev_experience TEXT;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS session_types TEXT;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS learning_outcomes TEXT;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS topics_covered TEXT;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS languages_known VARCHAR(255);
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS day_availability VARCHAR(255);
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS portfolio_links JSONB;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS demo_media TEXT[];
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE skills ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
    `);

    // 4. Services Table Columns
    await client.query(`
      ALTER TABLE services ADD COLUMN IF NOT EXISTS image_urls TEXT[];
      ALTER TABLE services ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active';
      ALTER TABLE services ADD COLUMN IF NOT EXISTS standard_plan NUMERIC;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS group_plan NUMERIC;
      ALTER TABLE services ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
    `);

    // 5. Inventory Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id                  SERIAL PRIMARY KEY,
        item_type           VARCHAR(50)  NOT NULL,
        item_id             INTEGER      NOT NULL,
        available_quantity  INTEGER      NOT NULL CHECK (available_quantity >= 0),
        UNIQUE(item_type, item_id)
      );
    `);

    // 6. Orders Table Columns
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS booking_date DATE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS booking_slot VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_plan_type VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_price VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS learning_goal TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS preferred_schedule VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_skill_level VARCHAR(50);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    // 7. Chats Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        chat_id     SERIAL PRIMARY KEY,
        order_id    INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        buyer_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        seller_id   INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status      VARCHAR(50)  DEFAULT 'Active',
        is_closed   BOOLEAN      DEFAULT FALSE,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id)
      );
    `);

    // Add is_closed column if missing (for existing tables)
    await client.query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE;`);

    // 8. Messages Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id    SERIAL PRIMARY KEY,
        chat_id       INTEGER  NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
        sender_id     INTEGER  NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
        message_text  TEXT     NOT NULL,
        is_read       BOOLEAN  DEFAULT FALSE,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Reviews Table Columns
    await client.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS communication_rating INT CHECK (communication_rating >= 1 AND communication_rating <= 5);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS teaching_rating INT CHECK (teaching_rating >= 1 AND teaching_rating <= 5);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS outcome_rating INT CHECK (outcome_rating >= 1 AND outcome_rating <= 5);
    `);

    // 10. Wishlist Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER      REFERENCES users(id) ON DELETE CASCADE,
        item_type   VARCHAR(50)  NOT NULL,
        item_id     INTEGER      NOT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_type, item_id)
      );
    `);

    // 11. Reports Table Columns
    await client.query(`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS chat_id INT REFERENCES chats(chat_id) ON DELETE SET NULL;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'Medium';
    `);

    // 12. User Notifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER      REFERENCES users(id) ON DELETE CASCADE,
        title             VARCHAR(255) NOT NULL,
        message           TEXT         NOT NULL,
        item_type         VARCHAR(50)  NOT NULL,
        item_id           INTEGER,
        status            VARCHAR(50),
        rejection_reason  TEXT,
        is_read           BOOLEAN      DEFAULT FALSE,
        created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. Notify Requests Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notify_requests (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER   REFERENCES users(id)    ON DELETE CASCADE,
        product_id  INTEGER   REFERENCES products(id) ON DELETE CASCADE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );
    `);

    // 14. Restock Notifications Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS restock_notifications (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER      REFERENCES users(id)    ON DELETE CASCADE,
        product_id  INTEGER      REFERENCES products(id) ON DELETE CASCADE,
        title       VARCHAR(255) DEFAULT 'Product Restocked',
        message     VARCHAR(255) NOT NULL,
        is_read     BOOLEAN      DEFAULT FALSE,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 15. Verification Requests Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_requests (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(255)  NOT NULL,
        badge_type    VARCHAR(100)  NOT NULL,
        department    VARCHAR(100)  NOT NULL,
        request_date  DATE          NOT NULL,
        status        VARCHAR(50)   DEFAULT 'Pending',
        document_url  VARCHAR(255)  DEFAULT 'student_id.pdf',
        created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 16. Suspension History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suspension_history (
        id               SERIAL PRIMARY KEY,
        target_type      VARCHAR(50)  NOT NULL,
        target_id        INTEGER      NOT NULL,
        admin_id         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
        action           VARCHAR(50)  NOT NULL,
        duration         VARCHAR(50),
        suspended_until  TIMESTAMP,
        reason           TEXT,
        severity_level   VARCHAR(50),
        created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 17. Warn History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS warn_history (
        id             SERIAL PRIMARY KEY,
        target_type    VARCHAR(50)  NOT NULL,
        target_id      INTEGER      NOT NULL,
        target_user_id INTEGER      REFERENCES users(id) ON DELETE SET NULL,
        admin_id       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
        reason         TEXT         NOT NULL,
        created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 18. Admin Action History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_action_history (
        id             SERIAL PRIMARY KEY,
        admin_id       INTEGER      REFERENCES users(id)   ON DELETE SET NULL,
        report_id      INTEGER      REFERENCES reports(id) ON DELETE SET NULL,
        action_taken   VARCHAR(100) NOT NULL,
        action_reason  TEXT,
        created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Backfill inventory defaults if missing
    await client.query(`
      INSERT INTO inventory (item_type, item_id, available_quantity)
      SELECT 'product', id, quantity FROM products
      ON CONFLICT (item_type, item_id) DO NOTHING;

      INSERT INTO inventory (item_type, item_id, available_quantity)
      SELECT 'skill', id, 1 FROM skills
      ON CONFLICT (item_type, item_id) DO NOTHING;

      INSERT INTO inventory (item_type, item_id, available_quantity)
      SELECT 'service', id, 1 FROM services
      ON CONFLICT (item_type, item_id) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Automated migrations successfully applied and verified.');

    // Seed admin user if not exists
    try {
      const adminEmail = 'admin@kristujayanti.com';
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
      if (existing.rows.length === 0) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('Admin@123', salt);
        await client.query(
          'INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
          ['Campus', 'Admin', adminEmail, hash, 'admin']
        );
        console.log('Admin user seeded: admin@kristujayanti.com');
      }
    } catch (seedErr) {
      console.error('Admin seed failed (non-fatal):', seedErr.message);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
  }
};

module.exports = runMigrations;
