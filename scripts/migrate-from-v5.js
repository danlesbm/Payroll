// Chuyển hệ số + mã NV + loại nhân sự từ bản Payroll cũ (schema public) sang schema payroll_v1.
// Chạy SAU khi đã bấm "Đồng bộ từ SSO" trên bản mới:  docker compose exec payroll node scripts/migrate-from-v5.js
// Ánh xạ cột cũ -> hệ số mới ở bảng MAP bên dưới. HÃY ĐỐI CHIẾU lại ý nghĩa cho đúng công ty.
require('dotenv').config();
const { Pool } = require('pg');
const SCHEMA = process.env.DB_SCHEMA || 'payroll_v1';
const MAP = { salary_coefficient: 'bhxh', duty_coefficient: 'chuc_vu', skill_coefficient: 'ky_nang', seniority_coefficient: 'tham_nien',
  concurrent_coefficient: 'kiem_nhiem', area_coefficient: 'vung', large_plant_coefficient: 'nha_may_lon', other_coefficient: 'khac',
  bonus_coefficient: 'thuong', safety_allowance: 'an_toan' };
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const old = await pool.query(`SELECT h.*, e.sso_user_id FROM public.coefficient_history h JOIN public.employees e ON e.id=h.employee_id ORDER BY h.effective_from, h.created_at`);
  let n = 0, miss = 0;
  for (const h of old.rows) {
    const emp = await pool.query(`SELECT id FROM ${SCHEMA}.employees WHERE sso_user_id=$1`, [h.sso_user_id]);
    if (!emp.rowCount) { miss++; continue; }
    const vals = {}; for (const [col, code] of Object.entries(MAP)) if (h[col] != null && Number(h[col]) !== 0) vals[code] = Number(h[col]);
    await pool.query(`INSERT INTO ${SCHEMA}.coefficient_history(employee_id, effective_from, vals, note, created_by) VALUES($1,$2,$3,$4,$5)`,
      [emp.rows[0].id, h.effective_from, JSON.stringify(vals), (h.note || '') + ' [chuyển từ bản cũ]', h.created_by || 'migrate']);
    n++;
  }
  let m = 0;
  for (const e of (await pool.query('SELECT sso_user_id, employee_code, employee_type FROM public.employees')).rows) {
    m += (await pool.query(`UPDATE ${SCHEMA}.employees SET employee_code=COALESCE($2, employee_code), employee_type=CASE WHEN $3 IN ('manager','admin','worker') THEN $3 ELSE employee_type END WHERE sso_user_id=$1`, [e.sso_user_id, e.employee_code || null, e.employee_type || null])).rowCount;
  }
  console.log(`Đã chuyển ${n} bản ghi hệ số (bỏ qua ${miss} người chưa có bên mới), cập nhật ${m} nhân sự.`);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
