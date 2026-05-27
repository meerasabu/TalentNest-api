-- =============================================================================
-- TalentNest PostgreSQL Schema
-- Generated from all migration scripts
-- Run this on a fresh database to set up the full schema.
-- =============================================================================

-- ===========================================================================
-- 1. USERS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  first_name            VARCHAR(100)  NOT NULL,
  last_name             VARCHAR(100)  NOT NULL,
  email                 VARCHAR(255)  UNIQUE NOT NULL,
  password_hash         VARCHAR(255)  NOT NULL,
  role                  VARCHAR(50)   DEFAULT 'user',          -- 'user' | 'admin'
  department            VARCHAR(100),
  graduation_year       INTEGER,
  bio                   TEXT,
  phone_number          VARCHAR(20),
  campus_location       VARCHAR(100),
  skills                JSONB         DEFAULT '[]',
  profile_image         VARCHAR(255),
  banner_image          VARCHAR(255),
  account_status        VARCHAR(50)   DEFAULT 'Active',        -- 'Active' | 'Suspended' | 'Banned'
  suspended_until       TIMESTAMP,
  reset_otp             VARCHAR(6),
  reset_otp_expires_at  TIMESTAMP,
  last_login_at         TIMESTAMP,
  profile_updated_at    TIMESTAMP,
  created_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 2. REGISTRATION OTPs  (temporary staging table)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS registration_otps (
  email              VARCHAR(255) PRIMARY KEY,
  otp                VARCHAR(6)   NOT NULL,
  expires_at         TIMESTAMP    NOT NULL,
  registration_data  JSONB        NOT NULL    -- stores { firstName, lastName, department, graduationYear, passwordHash }
);

-- ===========================================================================
-- 3. PRODUCTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL,
  condition   VARCHAR(100),
  category    VARCHAR(100),
  image_url   VARCHAR(255),
  quantity    INTEGER       DEFAULT 1,
  status      VARCHAR(50)   DEFAULT 'Available',   -- 'Available' | 'Sold Out' | 'Suspended'
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 4. SKILLS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS skills (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER       REFERENCES users(id) ON DELETE CASCADE,
  title                VARCHAR(255)  NOT NULL,
  description          TEXT,
  category             VARCHAR(100),
  hourly_rate          DECIMAL(10,2),
  image_url            VARCHAR(255),
  status               VARCHAR(50)   DEFAULT 'Pending Verification',  -- 'Pending Verification' | 'Active' | 'Rejected' | 'Suspended'
  charge_type          VARCHAR(50),
  available_time_slot  VARCHAR(255),
  skill_type           VARCHAR(50)   DEFAULT 'Online',  -- 'Online' | 'In-Person'
  experience_level     VARCHAR(50),
  prev_experience      TEXT,
  session_types        TEXT,
  learning_outcomes    TEXT,
  topics_covered       TEXT,
  languages_known      VARCHAR(255),
  day_availability     VARCHAR(255),
  portfolio_links      JSONB,
  demo_media           TEXT[],
  rejection_reason     TEXT,
  suspended_until      TIMESTAMP,
  created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 5. SERVICES
-- ===========================================================================
CREATE TABLE IF NOT EXISTS services (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER       REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(255)  NOT NULL,
  description     TEXT,
  service_type    VARCHAR(100),
  rate            DECIMAL(10,2),
  image_url       VARCHAR(255),
  status          VARCHAR(50)   DEFAULT 'Active',   -- 'Active' | 'Suspended'
  standard_plan   NUMERIC,
  group_plan      NUMERIC,
  suspended_until TIMESTAMP,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 6. INVENTORY
-- ===========================================================================
CREATE TABLE IF NOT EXISTS inventory (
  id                  SERIAL PRIMARY KEY,
  item_type           VARCHAR(50)  NOT NULL,    -- 'product' | 'skill' | 'service'
  item_id             INTEGER      NOT NULL,
  available_quantity  INTEGER      NOT NULL CHECK (available_quantity >= 0),
  UNIQUE(item_type, item_id)
);

-- ===========================================================================
-- 7. ORDERS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                  SERIAL PRIMARY KEY,
  buyer_id            INTEGER       REFERENCES users(id) ON DELETE CASCADE,
  seller_id           INTEGER       REFERENCES users(id) ON DELETE CASCADE,
  item_type           VARCHAR(50)   NOT NULL,    -- 'product' | 'skill' | 'service'
  item_id             INTEGER       NOT NULL,
  status              VARCHAR(50)   DEFAULT 'Pending',
    -- 'Pending' | 'Accepted' | 'Rejected' | 'Completed' | 'Cancelled'
  quantity            INTEGER       DEFAULT 1,
  booking_date        DATE,
  booking_slot        VARCHAR(100),
  selected_plan_type  VARCHAR(100),
  selected_price      VARCHAR(50),
  learning_goal       TEXT,
  preferred_schedule  VARCHAR(255),
  user_skill_level    VARCHAR(50),
  updated_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 8. CHATS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS chats (
  chat_id     SERIAL PRIMARY KEY,
  order_id    INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id   INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(50)  DEFAULT 'Active',   -- 'Active' | 'Closed'
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id)
);

-- ===========================================================================
-- 9. MESSAGES
-- ===========================================================================
CREATE TABLE IF NOT EXISTS messages (
  message_id    SERIAL PRIMARY KEY,
  chat_id       INTEGER  NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
  sender_id     INTEGER  NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  message_text  TEXT     NOT NULL,
  is_read       BOOLEAN  DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 10. REVIEWS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id                   SERIAL PRIMARY KEY,
  reviewer_id          INTEGER  REFERENCES users(id)  ON DELETE CASCADE,
  reviewed_id          INTEGER  REFERENCES users(id)  ON DELETE CASCADE,
  order_id             INTEGER  REFERENCES orders(id) ON DELETE CASCADE,
  rating               INTEGER  NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text          TEXT,
  communication_rating INTEGER  CHECK (communication_rating >= 1 AND communication_rating <= 5),
  teaching_rating      INTEGER  CHECK (teaching_rating      >= 1 AND teaching_rating      <= 5),
  outcome_rating       INTEGER  CHECK (outcome_rating       >= 1 AND outcome_rating       <= 5),
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 11. WISHLIST
-- ===========================================================================
CREATE TABLE IF NOT EXISTS wishlist (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      REFERENCES users(id) ON DELETE CASCADE,
  item_type   VARCHAR(50)  NOT NULL,   -- 'product' | 'skill' | 'service'
  item_id     INTEGER      NOT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, item_id)
);

-- ===========================================================================
-- 12. REPORTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS reports (
  id           SERIAL PRIMARY KEY,
  reporter_id  INTEGER      REFERENCES users(id)          ON DELETE CASCADE,
  reported_id  INTEGER      REFERENCES users(id)          ON DELETE CASCADE,
  chat_id      INTEGER      REFERENCES chats(chat_id)     ON DELETE SET NULL,
  reason       TEXT         NOT NULL,
  severity     VARCHAR(20)  DEFAULT 'Medium',   -- 'Low' | 'Medium' | 'High' | 'Critical'
  status       VARCHAR(50)  DEFAULT 'Pending',  -- 'Pending' | 'Resolved' | 'Dismissed'
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 13. USER NOTIFICATIONS  (order/listing status updates)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS user_notifications (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER      REFERENCES users(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  message           TEXT         NOT NULL,
  item_type         VARCHAR(50)  NOT NULL,   -- 'product' | 'skill' | 'service' | 'order'
  item_id           INTEGER,
  status            VARCHAR(50),
  rejection_reason  TEXT,
  is_read           BOOLEAN      DEFAULT FALSE,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 14. NOTIFY REQUESTS  (back-in-stock interest)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS notify_requests (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER   REFERENCES users(id)    ON DELETE CASCADE,
  product_id  INTEGER   REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id)
);

-- ===========================================================================
-- 15. RESTOCK NOTIFICATIONS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS restock_notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      REFERENCES users(id)    ON DELETE CASCADE,
  product_id  INTEGER      REFERENCES products(id) ON DELETE CASCADE,
  title       VARCHAR(255) DEFAULT 'Product Restocked',
  message     VARCHAR(255) NOT NULL,
  is_read     BOOLEAN      DEFAULT FALSE,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 16. VERIFICATION REQUESTS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS verification_requests (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255)  NOT NULL,
  badge_type    VARCHAR(100)  NOT NULL,   -- 'Verified Student' | 'Trusted Seller' | 'Skill Mentor'
  department    VARCHAR(100)  NOT NULL,
  request_date  DATE          NOT NULL,
  status        VARCHAR(50)   DEFAULT 'Pending',   -- 'Pending' | 'Approved' | 'Rejected'
  document_url  VARCHAR(255)  DEFAULT 'student_id.pdf',
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 17. SUSPENSION HISTORY
-- ===========================================================================
CREATE TABLE IF NOT EXISTS suspension_history (
  id               SERIAL PRIMARY KEY,
  target_type      VARCHAR(50)  NOT NULL,    -- 'user' | 'product' | 'skill' | 'service'
  target_id        INTEGER      NOT NULL,
  admin_id         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  action           VARCHAR(50)  NOT NULL,    -- 'suspend' | 'unsuspend' | 'ban'
  duration         VARCHAR(50),
  suspended_until  TIMESTAMP,
  reason           TEXT,
  severity_level   VARCHAR(50),
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 18. WARN HISTORY
-- ===========================================================================
CREATE TABLE IF NOT EXISTS warn_history (
  id             SERIAL PRIMARY KEY,
  target_type    VARCHAR(50)  NOT NULL,   -- 'user' | 'product' | 'skill' | 'service'
  target_id      INTEGER      NOT NULL,
  target_user_id INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  admin_id       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  reason         TEXT         NOT NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================================================
-- 19. ADMIN ACTION HISTORY
-- ===========================================================================
CREATE TABLE IF NOT EXISTS admin_action_history (
  id             SERIAL PRIMARY KEY,
  admin_id       INTEGER      REFERENCES users(id)   ON DELETE SET NULL,
  report_id      INTEGER      REFERENCES reports(id) ON DELETE SET NULL,
  action_taken   VARCHAR(100) NOT NULL,
  action_reason  TEXT,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
