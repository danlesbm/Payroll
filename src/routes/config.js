// Cấu hình: ký hiệu công, ăn ca, loại hệ số, khoản trừ, lương cơ sở, đơn giá, tham số chung.
const router = require('express').Router();
const { rows, one, pool, tx } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api } = require('../lib/http');
const { crud } = require('../lib/crud');
const { markStale } = require('../services/payroll');
const { applyExclusions } = require('../sso');
const { isEmpType } = require('../lib/emptypes');
const P = require('../lib/pit');
const pitSvc = require('../services/pit');
const admin = req => req.auth.needAdmin();
const needHr = req => { if (!req.auth.isAdmin && !req.auth.can('hr', {})) bad('Chỉ Admin hoặc người được phân quyền "Quản lý hệ số, đơn giá" mới được sửa', 403); };
const needAtt = req => { if (!req.auth.isAdmin && !req.auth.can('cfg_att', {}) && !req.auth.can('hr', {})) bad('Chỉ Admin hoặc người được phân quyền "Cài đặt chấm công" mới được sửa', 403); };
const staleAll = async () => { await markStale(pool); };

router.get('/', api(async req => {
  if (!req.auth.isAdmin && !req.auth.assignments.length) bad('Bạn không có quyền xem cấu hình', 403);
  const sensitive = req.auth.isAdmin || req.auth.assignments.some(a => ['hr', 'cfg_att', 'l2', 'l3', 'director'].includes(a.role));
  const [codes, mealTypes, codeMeals, coefTypes, dedTypes, settings, pitSchedules, salaryFunds] = await Promise.all([
    rows('SELECT * FROM attendance_codes ORDER BY sort_order, code'), rows('SELECT * FROM meal_types ORDER BY sort_order, name'),
    rows('SELECT code, meal_type_id, quantity FROM code_meals'), rows('SELECT * FROM coefficient_types ORDER BY sort_order, code'),
    rows('SELECT * FROM deduction_types ORDER BY sort_order, code'), rows('SELECT key, value FROM settings'),
    rows(`SELECT s.*, e.full_name AS updated_by_name, EXISTS (SELECT 1 FROM payroll_runs r WHERE r.status='locked' AND r.year >= s.year AND r.year < COALESCE((SELECT min(n.year) FROM pit_schedules n WHERE n.year > s.year), 9999)) AS has_locked FROM pit_schedules s LEFT JOIN employees e ON e.sso_user_id=s.updated_by ORDER BY s.year DESC`),
    rows('SELECT * FROM salary_funds ORDER BY sort_order, name')]);
  const out = { codes, mealTypes, codeMeals, coefTypes, dedTypes, settings: Object.fromEntries(settings.map(s => [s.key, s.value])), pitSchedules, salaryFunds };
  if (sensitive) {
    out.codeMealPrices = await rows(`SELECT p.*, g.name AS group_name, e.full_name AS by_name,
      (SELECT q.amount FROM code_meal_prices q WHERE q.code=p.code AND q.group_id IS NOT DISTINCT FROM p.group_id AND (q.effective_from, q.id) < (p.effective_from, p.id) ORDER BY q.effective_from DESC, q.id DESC LIMIT 1) AS prev_amount
    FROM code_meal_prices p LEFT JOIN groups g ON g.id=p.group_id LEFT JOIN employees e ON e.sso_user_id=p.created_by ORDER BY p.effective_from DESC, p.created_at DESC, p.code, p.id DESC`);
    out.mealRates = await rows('SELECT r.*, g.name AS group_name, t.name AS meal_type_name FROM meal_rates r LEFT JOIN groups g ON g.id=r.group_id JOIN meal_types t ON t.id=r.meal_type_id ORDER BY r.effective_from DESC');
    out.baseWages = await rows(`SELECT * FROM company_params WHERE key='base_wage' ORDER BY effective_from DESC, id DESC`);
    out.laborGrades = await rows('SELECT grade, factor FROM labor_grades ORDER BY sort_order, grade');
    out.safetyGrades = await rows('SELECT grade, factor FROM safety_grades ORDER BY sort_order, grade');
    out.unitPrices = await rows(`SELECT u.*, g.name AS group_name, d.name AS department_name FROM unit_prices u LEFT JOIN groups g ON g.id=u.group_id LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.effective_from DESC, u.created_at DESC`);
  }
  if (req.auth.isAdmin) {
    const { isExcluded, parsePatterns } = require('../lib/names');
    const pats = parsePatterns((await one("SELECT value FROM settings WHERE key='exclude_patterns'"))?.value), all = await rows("SELECT sso_name, full_name, username, email FROM employees WHERE sso_status<>'missing'");
    out.excludeCounts = pats.map(p => ({ pattern: p, count: all.filter(r => isExcluded(r, [p])).length }));
  }
  if (req.auth.isAdmin) out.excluded = await rows("SELECT id, COALESCE(sso_name, full_name) AS name, email, username FROM employees WHERE excluded AND sso_status<>'missing' ORDER BY 2");
  return out;
}));
// Số công của ký hiệu = công ngày + công đêm (tổng được lưu ở work_value để các nơi khác dùng chung)
router.use('/codes', (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH') {
    const b = req.body = req.body || {};
    const has = k => b[k] !== undefined && b[k] !== '';
    if (has('work_day') || has('work_night')) {
      const d = Number(b.work_day ?? 0), n = Number(b.work_night ?? 0);
      if (!Number.isFinite(d) || !Number.isFinite(n) || d < 0 || n < 0 || d > 31 || n > 31) return next(Object.assign(new Error('Công ngày / công đêm phải là số từ 0 đến 31'), { status: 400 }));
      b.work_day = d; b.work_night = n; b.work_value = Math.round((d + n) * 100) / 100;
    }
  }
  next();
});
// Đổi tên ký hiệu: mọi ô chấm công, mức tiền ăn, % cũ đi theo ký hiệu mới (khoá ngoại ON UPDATE CASCADE)
router.post('/codes/:code/rename', api(async req => {
  needAtt(req); const from = req.params.code, to = str(req.body?.code);
  if (!to || to.length > 12) bad('Ký hiệu mới phải từ 1 đến 12 ký tự');
  if (to === from) return { ok: true };
  if (!(await one('SELECT 1 AS x FROM attendance_codes WHERE code=$1', [from]))) bad('Không tìm thấy ký hiệu', 404);
  if (await one('SELECT 1 AS x FROM attendance_codes WHERE code=$1', [to])) bad(`Đã có ký hiệu "${to}"`, 409);
  await pool.query('UPDATE attendance_codes SET code=$2 WHERE code=$1', [from, to]);
  await staleAll(); await audit(req, 'codes.rename', 'attendance_codes', from, { to });
  return { ok: true };
}));
// Xoá ký hiệu: chỉ khi chưa được dùng ở ô chấm công nào; nếu đã dùng thì hướng dẫn tắt "Dùng"
router.delete('/codes/:code', api(async req => {
  needAtt(req); const code = req.params.code;
  const n = (await one('SELECT count(*)::int AS n FROM attendance_entries WHERE code=$1', [code])).n;
  if (n > 0) bad(`Ký hiệu "${code}" đang có ${n} ô chấm công dùng nên không xoá được (sẽ mất dữ liệu công). Hãy chuyển "Trạng thái" sang Ngừng để ẩn khỏi bảng chấm công.`, 409);
  const row = await one('DELETE FROM attendance_codes WHERE code=$1 RETURNING code', [code]);
  if (!row) bad('Không tìm thấy ký hiệu', 404);
  await staleAll(); await audit(req, 'codes.delete', 'attendance_codes', code, null);
  return { ok: true };
}));
crud(router, { path: 'codes', table: 'attendance_codes', pk: 'code', pkType: 'text', guard: needAtt, after: staleAll, fields: [
  { k: 'code', required: true, label: 'Ký hiệu' }, { k: 'name', required: true, label: 'Tên' }, { k: 'work_day', type: 'num', min: 0, max: 31, label: 'Công ngày' }, { k: 'work_night', type: 'num', min: 0, max: 31, label: 'Công đêm' }, { k: 'work_value', type: 'num', min: 0, max: 62, label: 'Tổng công' },
  { k: 'color', label: 'Màu' }, { k: 'off_day_zero', type: 'bool' }, { k: 'is_ot', type: 'bool' }, { k: 'leave_value', type: 'num', min: 0, max: 4, label: 'Công nghỉ' }, { k: 'pay_scope', type: 'enum', values: ['both', 'salary', 'bonus', 'none'], label: 'Tính cho' }, { k: 'meal_qty', type: 'num', min: 0, max: 10, label: 'Suất ăn (bảng chấm ăn ca riêng)' }, { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });
crud(router, { path: 'meal-types', table: 'meal_types', guard: needAtt, after: staleAll, fields: [{ k: 'is_wait', type: 'bool' }, 
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên loại suất' }, { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });
crud(router, { path: 'coefficient-types', table: 'coefficient_types', pk: 'code', pkType: 'text', guard: needHr, after: staleAll, fields: [
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên hệ số' },
  { k: 'kind', type: 'enum', values: ['insurance', 'bonus', 'amount', 'ins_amount'], required: true, label: 'Loại' }, { k: 'is_total', type: 'bool' }, { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });
crud(router, { path: 'deduction-types', table: 'deduction_types', pk: 'code', pkType: 'text', guard: needHr, after: staleAll, fields: [
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên khoản trừ' },
  { k: 'calc', type: 'enum', values: ['pct_insurance', 'fixed'], required: true, label: 'Cách tính' }, { k: 'value', type: 'num', min: 0, max: 1e9, label: 'Giá trị' },
  { k: 'pit_deductible', type: 'bool' }, { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });
// Quỹ lương (khối) để tổng hợp lương theo nguồn quỹ; quy tắc tự xếp: hdqt | bks | office | shift | plant (mỗi quy tắc chỉ gắn 1 quỹ)
crud(router, { path: 'salary-funds', table: 'salary_funds', guard: admin, after: staleAll, fields: [
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên quỹ lương' },
  { k: 'rule', type: 'enum', nullable: true, values: ['hdqt', 'bks', 'office', 'shift', 'plant'], label: 'Tự xếp' }, { k: 'note', label: 'Ghi chú' },
  { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });

// ===== Biểu thuế TNCN theo năm (bậc thuế động, giảm trừ bản thân / người phụ thuộc, mức tối đa y tế / giáo dục) =====
const moneyOk = (v, label, nullable) => { if (nullable && (v === '' || v === null || v === undefined)) return null; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e12) bad(`"${label}" phải là số tiền không âm`); return Math.round(n); };
router.put('/pit-schedules/:year', api(async req => {
  needHr(req);
  const year = Number(req.params.year); if (!Number.isInteger(year) || year < 2000 || year > 2200) bad('Năm áp dụng không hợp lệ');
  const b = req.body || {};
  let brackets; try { brackets = P.validateBrackets(b.brackets); } catch (e) { bad(e.message); }
  const v = [year, moneyOk(b.self_deduction, 'Giảm trừ bản thân'), moneyOk(b.dependent_deduction, 'Giảm trừ người phụ thuộc'), moneyOk(b.health_cap, 'Mức tối đa chi phí y tế', true), moneyOk(b.education_cap, 'Mức tối đa chi phí giáo dục', true), JSON.stringify(brackets), str(b.note).slice(0, 500) || null, req.auth.user.id];
  const r = await one(`INSERT INTO pit_schedules(year, self_deduction, dependent_deduction, health_cap, education_cap, brackets, note, updated_by, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (year) DO UPDATE SET self_deduction=EXCLUDED.self_deduction, dependent_deduction=EXCLUDED.dependent_deduction, health_cap=EXCLUDED.health_cap, education_cap=EXCLUDED.education_cap,
      brackets=EXCLUDED.brackets, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`, v);
  await pitSvc.staleFromYear(pool, year); await audit(req, 'pit_schedule.save', 'pit_schedules', String(year), { ...b, brackets });
  return r;
}));
router.delete('/pit-schedules/:year', api(async req => {
  needHr(req);
  const year = Number(req.params.year);
  if ((await one('SELECT count(*)::int AS n FROM pit_schedules')).n <= 1) bad('Phải giữ ít nhất 1 biểu thuế', 409);
  const r = await one('DELETE FROM pit_schedules WHERE year=$1 RETURNING *', [year]); if (!r) bad('Không tìm thấy biểu thuế', 404);
  await pitSvc.staleFromYear(pool, year); await audit(req, 'pit_schedule.delete', 'pit_schedules', String(year), r);
  return { ok: true };
}));

// Tiền ăn ca theo ký hiệu công (mỗi ký hiệu một mức; có thể riêng cho từng bảng lương; lưu theo ngày hiệu lực, giữ lịch sử)
router.post('/code-meal-prices/bulk', api(async req => {
  needAtt(req);
  const eff = dateOk(req.body?.effectiveFrom), list = Array.isArray(req.body?.rows) ? req.body.rows : bad('Không có dữ liệu');
  let saved = 0;
  await tx(async c => {
    for (const r of list) {
      const amount = Number(r.amount);
      if (r.amount === '' || r.amount === null || r.amount === undefined) continue;
      if (!(amount >= 0) || amount > 1e9) bad('Số tiền ăn ca không hợp lệ');
      r.groupId = null;   // một mức chung cho mọi bảng lương
      if (!(await c.query('SELECT 1 FROM attendance_codes WHERE code=$1', [r.code])).rowCount) bad(`Ký hiệu "${r.code}" không tồn tại`, 404);
      const cur = (await c.query(`SELECT amount FROM code_meal_prices WHERE code=$1 AND group_id IS NOT DISTINCT FROM $2::uuid AND effective_from<=$3 ORDER BY effective_from DESC, id DESC LIMIT 1`, [r.code, r.groupId || null, eff])).rows[0];
      if (cur ? Number(cur.amount) === amount : amount === 0) continue;
      await c.query('INSERT INTO code_meal_prices(code, group_id, amount, effective_from, created_by) VALUES($1,$2,$3,$4,$5)', [r.code, r.groupId || null, amount, eff, req.auth.user.id]); saved++;
      // Chuyển ngày hiệu lực sớm hơn (cùng số tiền): mức trùng tiền ngay sau ngày mới là thừa → xoá, để "đang áp dụng từ" hiện đúng ngày mới
      for (;;) {
        const nx = (await c.query(`SELECT id, amount FROM code_meal_prices WHERE code=$1 AND group_id IS NOT DISTINCT FROM $2::uuid AND effective_from>$3 ORDER BY effective_from, id LIMIT 1`, [r.code, r.groupId || null, eff])).rows[0];
        if (!nx || Number(nx.amount) !== amount) break;
        await c.query('DELETE FROM code_meal_prices WHERE id=$1', [nx.id]);
      }
    }
  });
  await staleAll(); await audit(req, 'code_meal_price.bulk', 'code_meal_prices', null, { effectiveFrom: eff, saved });
  return { ok: true, saved };
}));
router.delete('/code-meal-prices/:id', api(async req => { needAtt(req); await pool.query('DELETE FROM code_meal_prices WHERE id=$1', [Number(req.params.id) || 0]); await staleAll(); await audit(req, 'code_meal_price.delete', 'code_meal_prices', req.params.id); return { ok: true }; }));
router.put('/code-meals/:code', api(async req => {
  needAtt(req);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await tx(async c => {
    if (!(await c.query('SELECT 1 FROM attendance_codes WHERE code=$1', [req.params.code])).rowCount) bad('Ký hiệu công không tồn tại', 404);
    await c.query('DELETE FROM code_meals WHERE code=$1', [req.params.code]);
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!isUuid(it.mealTypeId) || !(qty > 0)) bad('Loại suất hoặc số lượng không hợp lệ');
      await c.query('INSERT INTO code_meals(code, meal_type_id, quantity) VALUES($1,$2,$3) ON CONFLICT (code, meal_type_id) DO UPDATE SET quantity=EXCLUDED.quantity', [req.params.code, it.mealTypeId, qty]);
    }
  });
  await staleAll(); await audit(req, 'code_meals.set', 'attendance_code', req.params.code, items);
  return { ok: true };
}));
const dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : bad('Ngày hiệu lực không hợp lệ (YYYY-MM-DD)');
router.post('/meal-rates', api(async req => {
  needAtt(req);
  const b = req.body || {}, amount = Number(b.amount);
  if (!isUuid(b.mealTypeId) || !(amount >= 0)) bad('Thiếu loại suất hoặc đơn giá');
  if (b.groupId && !isUuid(b.groupId)) bad('Bảng lương không hợp lệ');
  const r = await one('INSERT INTO meal_rates(meal_type_id, group_id, amount, effective_from, created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [b.mealTypeId, b.groupId || null, amount, dateOk(b.effectiveFrom), req.auth.user.id]);
  await staleAll(); await audit(req, 'meal_rate.add', 'meal_rate', r.id, b); return r;
}));
router.delete('/meal-rates/:id', api(async req => { needAtt(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ'); await pool.query('DELETE FROM meal_rates WHERE id=$1', [req.params.id]); await staleAll(); await audit(req, 'meal_rate.delete', 'meal_rate', req.params.id); return { ok: true }; }));
router.post('/base-wages', api(async req => {
  needHr(req);
  const value = Number(req.body?.value); if (!(value > 0)) bad('Lương cơ sở phải lớn hơn 0');
  const et = req.body?.employeeType || null; if (et && !isEmpType(et)) bad('Loại nhân sự không hợp lệ');
  const r = await one(`INSERT INTO company_params(key, value, effective_from, note, created_by, employee_type) VALUES('base_wage',$1,$2,$3,$4,$5) RETURNING *`, [value, dateOk(req.body?.effectiveFrom), str(req.body?.note) || null, req.auth.user.id, et]);
  await staleAll(); await audit(req, 'base_wage.add', 'company_params', r.id, req.body); return r;
}));
router.delete('/base-wages/:id', api(async req => { needHr(req); await pool.query(`DELETE FROM company_params WHERE id=$1 AND key='base_wage'`, [Number(req.params.id) || 0]); await staleAll(); await audit(req, 'base_wage.delete', 'company_params', req.params.id); return { ok: true }; }));
router.patch('/base-wages/:id', api(async req => {
  needHr(req);
  const id = Number(req.params.id) || 0, value = Number(req.body?.value); if (!(value > 0)) bad('Lương cơ sở phải lớn hơn 0');
  const et = req.body?.employeeType || null; if (et && !isEmpType(et)) bad('Loại nhân sự không hợp lệ');
  const r = await one(`UPDATE company_params SET value=$2, effective_from=$3, note=$4, employee_type=$5 WHERE id=$1 AND key='base_wage' RETURNING *`, [id, value, dateOk(req.body?.effectiveFrom), str(req.body?.note) || null, et]);
  if (!r) bad('Không tìm thấy', 404);
  await staleAll(); await audit(req, 'base_wage.edit', 'company_params', id, req.body); return r;
}));
router.patch('/unit-prices/:id', api(async req => {
  needHr(req);
  const b = req.body || {}, amount = Number(b.amount);
  if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  if (!(amount >= 0)) bad('Đơn giá không hợp lệ');
  if (b.groupId && !isUuid(b.groupId)) bad('Bảng lương không hợp lệ');
  if (b.departmentId && !isUuid(b.departmentId)) bad('Phòng không hợp lệ');
  if (b.employeeType && !isEmpType(b.employeeType)) bad('Loại nhân sự không hợp lệ');
  const r = await one(`UPDATE unit_prices SET group_id=$2, department_id=$3, employee_type=$4, amount=$5, effective_from=$6, note=$7 WHERE id=$1 RETURNING *`,
    [req.params.id, b.groupId || null, b.departmentId || null, b.employeeType || null, amount, dateOk(b.effectiveFrom), str(b.note) || null]);
  if (!r) bad('Không tìm thấy', 404);
  await staleAll(); await audit(req, 'unit_price.edit', 'unit_price', req.params.id, b); return r;
}));
router.post('/unit-prices', api(async req => {
  needHr(req);
  const b = req.body || {}, amount = Number(b.amount);
  if (!(amount >= 0)) bad('Đơn giá không hợp lệ');
  if (b.groupId && !isUuid(b.groupId)) bad('Bảng lương không hợp lệ');
  if (b.departmentId && !isUuid(b.departmentId)) bad('Phòng không hợp lệ');
  if (b.employeeType && !isEmpType(b.employeeType)) bad('Loại nhân sự không hợp lệ');
  const r = await one(`INSERT INTO unit_prices(group_id, department_id, employee_type, amount, effective_from, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.groupId || null, b.departmentId || null, b.employeeType || null, amount, dateOk(b.effectiveFrom), str(b.note) || null, req.auth.user.id]);
  await staleAll(); await audit(req, 'unit_price.add', 'unit_price', r.id, b); return r;
}));
router.delete('/unit-prices/:id', api(async req => { needHr(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ'); await pool.query('DELETE FROM unit_prices WHERE id=$1', [req.params.id]); await staleAll(); await audit(req, 'unit_price.delete', 'unit_price', req.params.id); return { ok: true }; }));

const SETTING_KEYS = {
  company_name: v => str(v) || bad('Tên công ty không được trống'),
  year_min: v => { if (str(v) === '') return ''; const n = Math.trunc(Number(v)); return n >= 2000 && n <= 2100 ? String(n) : bad('Năm nhỏ nhất phải trong khoảng 2000–2100'); },
  year_max: v => { if (str(v) === '') return ''; const n = Math.trunc(Number(v)); return n >= 2000 && n <= 2200 ? String(n) : bad('Năm lớn nhất phải trong khoảng 2000–2200'); },
  standard_days: v => { const n = Number(v); return n > 0 && n <= 31 ? String(n) : bad('Công chuẩn phải từ 1 đến 31'); },
  meal_in_net: v => String(v === true || v === 'true'),
  place: v => str(v) || bad('Địa danh không được trống'),
  exclude_patterns: v => String(v ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).join('\n'),
  plant_title_head: v => String(v ?? '').trim().slice(0, 60),
  plant_title_deputy: v => String(v ?? '').trim().slice(0, 60),
  safety_coef: v => String(v ?? ''),
  require_l1: v => String(v === true || v === 'true'),
  premium_method: v => (v === 'A' || v === 'B' ? v : bad('Phương pháp tính tiền làm lễ, làm thêm không hợp lệ')),
  pit_withhold: v => (v === 'none' || v === 'bonus' ? v : bad('Cách xử lý thuế TNCN tạm tính không hợp lệ'))
};
router.put('/settings', api(async req => {
  admin(req);
  const clean = {};
  for (const k of Object.keys(req.body || {})) { if (!SETTING_KEYS[k]) bad(`Cài đặt "${k}" không hợp lệ`); clean[k] = SETTING_KEYS[k](req.body[k]); }
  if (Number(clean.year_min) && Number(clean.year_max) && Number(clean.year_min) > Number(clean.year_max)) bad('Năm nhỏ nhất phải ≤ năm lớn nhất');
  for (const [k, v] of Object.entries(clean)) await pool.query(`INSERT INTO settings(key, value, updated_by) VALUES($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [k, v, req.auth.user.id]);
  if ('exclude_patterns' in clean) await applyExclusions(pool);
  if (['standard_days', 'meal_in_net', 'premium_method', 'pit_withhold'].some(k => k in clean)) await staleAll();
  await audit(req, 'settings.update', 'settings', null, clean);
  return { ok: true };
}));
// Hệ số xếp loại lao động (nhân vào lương BH và thưởng định kỳ) và tỷ lệ phụ cấp an toàn
router.put('/grades', api(async req => {
  needHr(req);
  const { labor = {}, safety = {} } = req.body || {};
  await tx(async c => {
    for (const [g, f] of Object.entries(labor)) { const n = Number(f); if (!/^[A-E]$/.test(g) || !Number.isFinite(n) || n < 0 || n > 10) bad(`Hệ số xếp loại ${g} không hợp lệ (0–10)`); await c.query('UPDATE labor_grades SET factor=$2 WHERE grade=$1', [g, n]); }
    for (const [g, a] of Object.entries(safety)) { const n = Number(a); if (!/^[A-C]$/.test(g) || !Number.isFinite(n) || n < 0 || n > 1) bad(`Tỷ lệ phụ cấp an toàn loại ${g} không hợp lệ (0–100%)`); await c.query('UPDATE safety_grades SET factor=$2 WHERE grade=$1', [g, n]); }
  });
  await staleAll(); await audit(req, 'grades.update', 'labor_grades', null, { labor, safety });
  return { ok: true };
}));
module.exports = router;
