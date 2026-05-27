const pool = require('./db');

const createChatTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create chats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chats (
        chat_id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'Active',
        UNIQUE(order_id)
      );
    `);

    // Create messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT FALSE
      );
    `);

    await client.query('COMMIT');
    console.log('Chat tables created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating chat tables:', error);
  } finally {
    client.release();
  }
};

createChatTables();
