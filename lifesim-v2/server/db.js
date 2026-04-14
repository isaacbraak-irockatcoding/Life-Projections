const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Convert ? placeholders to $1, $2, ... for PostgreSQL
function toPositional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const db = {
  async get(sql, params = []) {
    const { rows } = await pool.query(toPositional(sql), params);
    return rows[0] ?? null;
  },

  async all(sql, params = []) {
    const { rows } = await pool.query(toPositional(sql), params);
    return rows;
  },

  async run(sql, params = []) {
    await pool.query(toPositional(sql), params);
  },

  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tdb = {
        async get(sql, params = []) {
          const { rows } = await client.query(toPositional(sql), params);
          return rows[0] ?? null;
        },
        async all(sql, params = []) {
          const { rows } = await client.query(toPositional(sql), params);
          return rows;
        },
        async run(sql, params = []) {
          await client.query(toPositional(sql), params);
        },
      };
      const result = await fn(tdb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

// Run migrations on startup to create all tables
async function runMigrations() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '001_init.sql'),
    'utf8'
  );
  await pool.query(sql);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

module.exports = db;
