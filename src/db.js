const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
types.setTypeParser(1082, v => v);   // cột date -> chuỗi 'YYYY-MM-DD' (tránh lệch ngày do múi giờ)

// Toàn bộ bảng Payroll v1 nằm trong schema riêng -> KHÔNG đụng dữ liệu cũ ở schema public.
const SCHEMA = process.env.DB_SCHEMA || 'payroll_v1';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${SCHEMA},public` });
const rows = async (sql, params) => (await pool.query(sql, params)).rows;
const one = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
async function initDb() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
}
module.exports = { pool, rows, one, tx, initDb, SCHEMA };
