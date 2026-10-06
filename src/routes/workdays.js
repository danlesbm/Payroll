// Công chuẩn: ngày lễ trong năm, quy tắc lịch nghỉ / công tối thiểu / tăng ca theo phòng – bảng lương – loại nhân sự.
const router = require('express').Router();
const { rows, one, pool } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api } = require('../lib/http');
const W = require('../lib/workdays');
const { markStale } = require('../services/payroll');

const needHr = req => { if (!req.auth.isAdmin && !req.auth.can('hr', {})) bad('Chỉ Admin hoặc người được phân quyền "Quản lý hệ số, đơn giá" mới được sửa', 403); };
const needAtt = req => { if (!req.auth.isAdmin && !req.auth.can('hr', {}) && !req.auth.can('cfg_att', {})) bad('Chỉ Admin hoặc người được phân quyền "Cài đặt chấm công" mới được sửa', 403); };
const dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v)) ? String(v) : null;
const yearOf = v => { const y = Math.trunc(Number(v)); return y >= 2000 && y <= 2200 ? y : bad('Năm không hợp lệ'); };
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
// Ngày lễ cố định theo dương lịch. Tết Âm lịch, Giỗ Tổ… thay đổi theo năm nên phải tự nhập.
const FIXED = [['01-01', 'Tết Dương lịch'], ['04-30', 'Ngày Giải phóng miền Nam'], ['05-01', 'Quốc tế Lao động'], ['09-02', 'Quốc khánh']];

router.get('/holidays', api(async req => {
  const y = yearOf(req.query.year);
  const list = await rows(`SELECT id, to_char(hdate,'YYYY-MM-DD') AS date, name, pay_pct, EXTRACT(DOW FROM hdate)::int AS dow FROM holidays WHERE hdate BETWEEN $1 AND $2 ORDER BY hdate`, [`${y}-01-01`, `${y}-12-31`]);
  return { year: y, holidays: list };
}));
router.post('/holidays', api(async req => {
  needAtt(req);
  const b = req.body || {}, from = dateOk(b.from || b.date), to = dateOk(b.to || b.from || b.date), name = str(b.name), pct = pctOk(b.payPct);
  if (!from || !to) bad('Ngày không hợp lệ'); if (!name) bad('Nhập tên ngày lễ / ngày nghỉ bù');
  if (to < from) bad('"Đến ngày" phải sau hoặc bằng "Từ ngày"');
  const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1; if (n > 31) bad('Tối đa 31 ngày mỗi lần nhập');
  for (let i = 0; i < n; i++) await pool.query(`INSERT INTO holidays(hdate, name, pay_pct, created_by) VALUES($1,$2,$3,$4) ON CONFLICT (hdate) DO UPDATE SET name=EXCLUDED.name, pay_pct=EXCLUDED.pay_pct`, [addDays(from, i), name, pct, req.auth.user.id]);
  await markStale(pool); await audit(req, 'holiday.add', 'holiday', null, { from, to, name, pct });
  return { ok: true, added: n };
}));
const pctOk = v => { const n = v === '' || v == null ? 100 : Number(v); return Number.isFinite(n) && n >= 0 && n <= 2000 ? n : bad('% hưởng phải từ 0 đến 2000'); };
// Sửa một ngày lễ: đổi tên, ngày, % hưởng khi làm vào ngày đó (vd 400 = 400% công tiêu chuẩn)
router.patch('/holidays/:id', api(async req => {
  needAtt(req); if (!/^\d+$/.test(req.params.id)) bad('Mã không hợp lệ');
  const b = req.body || {}, sets = [], p = [req.params.id], add = (c, v) => { p.push(v); sets.push(`${c}=$${p.length}`); };
  if ('name' in b) { if (!str(b.name)) bad('Nhập tên ngày lễ'); add('name', str(b.name)); }
  if ('payPct' in b) add('pay_pct', pctOk(b.payPct));
  if ('date' in b) { const d = dateOk(b.date); if (!d) bad('Ngày không hợp lệ'); add('hdate', d); }
  if (!sets.length) bad('Không có gì để cập nhật');
  const r = await pool.query(`UPDATE holidays SET ${sets.join(',')} WHERE id=$1`, p).catch(e => e.code === '23505' ? bad('Ngày này đã có trong danh sách') : (() => { throw e; })());
  if (!r.rowCount) bad('Không tìm thấy ngày lễ', 404);
  await markStale(pool); await audit(req, 'holiday.update', 'holiday', req.params.id, b);
  return { ok: true };
}));
router.delete('/holidays/:id', api(async req => {
  needAtt(req); if (!/^\d+$/.test(req.params.id)) bad('Mã không hợp lệ');
  await pool.query('DELETE FROM holidays WHERE id=$1', [req.params.id]); await markStale(pool); await audit(req, 'holiday.delete', 'holiday', req.params.id);
  return { ok: true };
}));
router.post('/holidays/template', api(async req => {
  needAtt(req); const y = yearOf(req.body?.year); let n = 0;
  for (const [md, name] of FIXED) n += (await pool.query(`INSERT INTO holidays(hdate, name, created_by) VALUES($1,$2,$3) ON CONFLICT (hdate) DO NOTHING`, [`${y}-${md}`, name, req.auth.user.id])).rowCount;
  if (n) await markStale(pool); await audit(req, 'holiday.template', 'holiday', null, { year: y, added: n });
  return { ok: true, added: n };
}));
// Sao chép ngày lễ của năm khác (cùng ngày dương lịch) — tiện cho các ngày cố định
router.post('/holidays/copy', api(async req => {
  needAtt(req); const a = yearOf(req.body?.from), b = yearOf(req.body?.to); if (a === b) bad('Hai năm phải khác nhau');
  const r = await pool.query(`INSERT INTO holidays(hdate, name, created_by) SELECT make_date($2, EXTRACT(MONTH FROM hdate)::int, EXTRACT(DAY FROM hdate)::int), name, $3 FROM holidays
      WHERE EXTRACT(YEAR FROM hdate)=$1 AND NOT (EXTRACT(MONTH FROM hdate)=2 AND EXTRACT(DAY FROM hdate)=29) ON CONFLICT (hdate) DO NOTHING`, [a, b, req.auth.user.id]);
  if (r.rowCount) await markStale(pool); await audit(req, 'holiday.copy', 'holiday', null, { from: a, to: b, added: r.rowCount });
  return { ok: true, added: r.rowCount };
}));

// ===== Quy tắc =====
const RULE_SQL = `SELECT r.*, g.name AS group_name, d.name AS department_name FROM schedule_rules r LEFT JOIN groups g ON g.id=r.group_id LEFT JOIN departments d ON d.id=r.department_id`;
function ruleBody(b) {
  const out = { group_id: b.groupId || null, department_id: b.departmentId || null, employee_type: b.employeeType || null };
  if (out.group_id && !isUuid(out.group_id)) bad('Bảng lương không hợp lệ'); if (out.department_id && !isUuid(out.department_id)) bad('Phòng không hợp lệ');
  if (out.employee_type && !['manager', 'worker'].includes(out.employee_type)) bad('Loại nhân sự không hợp lệ');
  out.weekly_off = W.isWeekly(b.weeklyOff) ? b.weeklyOff : bad('Chọn lịch nghỉ hằng tuần');
  out.min_mode = ['equal', 'fixed', 'minus', 'pct', 'group_min'].includes(b.minMode) ? b.minMode : bad('Chọn cách tính công tối thiểu');
  const mv = b.minValue === '' || b.minValue == null ? 0 : Number(b.minValue);
  if (!Number.isFinite(mv) || mv < 0) bad('Giá trị công tối thiểu không hợp lệ');
  if (out.min_mode === 'fixed' && !(mv > 0 && mv <= 31)) bad('Công tối thiểu cố định phải từ 0,5 đến 31 ngày');
  if (out.min_mode === 'minus' && mv > 31) bad('Số ngày trừ phải ≤ 31'); if (out.min_mode === 'pct' && mv > 100) bad('Phần trăm phải ≤ 100');
  out.min_value = ['equal', 'group_min'].includes(out.min_mode) ? 0 : mv;
  out.rate_basis = b.rateBasis === 'min' ? 'min' : 'standard';
  for (const [k, f] of [['ot_salary', 'otSalary'], ['ot_bonus', 'otBonus']]) { const v = b[f] === '' || b[f] == null ? 1 : Number(b[f]); if (!(v >= 0 && v <= 5)) bad('Hệ số tăng ca phải từ 0 đến 5'); out[k] = v; }
  out.note = str(b.note) || null; return out;
}
const dupMsg = e => e.code === '23505' ? bad('Đã có quy tắc cho đúng phạm vi này — hãy sửa quy tắc cũ') : (() => { throw e; })();
router.get('/rules', api(async () => ({ rules: await rows(`${RULE_SQL} ORDER BY (r.department_id IS NOT NULL), (r.group_id IS NOT NULL), (r.employee_type IS NOT NULL), g.name, d.name`) })));
router.post('/rules', api(async req => {
  needAtt(req); const r = ruleBody(req.body || {});
  const row = await one(`INSERT INTO schedule_rules(group_id, department_id, employee_type, weekly_off, min_mode, min_value, ot_salary, ot_bonus, note, updated_by, rate_basis) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [r.group_id, r.department_id, r.employee_type, r.weekly_off, r.min_mode, r.min_value, r.ot_salary, r.ot_bonus, r.note, req.auth.user.id, r.rate_basis]).catch(dupMsg);
  await markStale(pool); await audit(req, 'schedule_rule.add', 'schedule_rule', row.id, r); return { ok: true, id: row.id };
}));
router.put('/rules/:id', api(async req => {
  needAtt(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ'); const r = ruleBody(req.body || {});
  const row = await one(`UPDATE schedule_rules SET group_id=$2, department_id=$3, employee_type=$4, weekly_off=$5, min_mode=$6, min_value=$7, ot_salary=$8, ot_bonus=$9, note=$10, updated_by=$11, rate_basis=$12, updated_at=now() WHERE id=$1 RETURNING id`,
    [req.params.id, r.group_id, r.department_id, r.employee_type, r.weekly_off, r.min_mode, r.min_value, r.ot_salary, r.ot_bonus, r.note, req.auth.user.id, r.rate_basis]).catch(dupMsg);
  if (!row) bad('Không tìm thấy quy tắc', 404); await markStale(pool); await audit(req, 'schedule_rule.update', 'schedule_rule', row.id, r); return { ok: true };
}));
router.delete('/rules/:id', api(async req => {
  needAtt(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const r = await one('SELECT * FROM schedule_rules WHERE id=$1', [req.params.id]); if (!r) bad('Không tìm thấy quy tắc', 404);
  await pool.query('DELETE FROM schedule_rules WHERE id=$1', [r.id]); await markStale(pool); await audit(req, 'schedule_rule.delete', 'schedule_rule', r.id); return { ok: true };
}));

// ===== Xem trước công chuẩn 12 tháng của từng quy tắc (kèm số ngày nghỉ / lễ) =====
router.get('/preview', api(async req => {
  const y = yearOf(req.query.year);
  const hol = new Set((await rows(`SELECT to_char(hdate,'YYYY-MM-DD') d FROM holidays WHERE hdate BETWEEN $1 AND $2`, [`${y}-01-01`, `${y}-12-31`])).map(h => h.d));
  const rules = await rows(`${RULE_SQL} ORDER BY (r.department_id IS NOT NULL), (r.group_id IS NOT NULL), (r.employee_type IS NOT NULL), g.name, d.name`);
  const out = rules.map(r => {
    const months = []; let total = 0;
    for (let m = 1; m <= 12; m++) { const i = W.monthInfo(y, m, r.weekly_off, hol); months.push({ month: m, standard: i.standard, min: W.minDays(r, i.standard), weekly: i.weekly, holidays: i.holidays, overlap: i.overlap }); total += i.standard; }
    return { id: r.id, group_name: r.group_name, department_name: r.department_name, employee_type: r.employee_type, weekly_off: r.weekly_off, min_mode: r.min_mode, min_value: r.min_value, rate_basis: r.rate_basis, months, total };
  });
  return { year: y, rules: out };
}));
// Công chuẩn / ngày nghỉ của một tháng cho một lịch (dùng cho màn chấm công)
router.get('/month', api(async req => {
  const y = yearOf(req.query.year), m = Math.trunc(Number(req.query.month)); if (!(m >= 1 && m <= 12)) bad('Tháng không hợp lệ');
  const hol = await rows(`SELECT to_char(hdate,'YYYY-MM-DD') AS date, name FROM holidays WHERE hdate BETWEEN $1 AND $2 ORDER BY hdate`, [`${y}-${W.pad(m)}-01`, `${y}-${W.pad(m)}-${W.pad(W.dim(y, m))}`]);
  const set = new Set(hol.map(h => h.date));
  return { year: y, month: m, holidays: hol, sun: W.monthInfo(y, m, 'sun', set), sat_sun: W.monthInfo(y, m, 'sat_sun', set) };
}));

// ===== Nhóm tính phụ cấp (đối tượng hưởng % khác nhau) =====
router.get('/allowance-groups', api(async () => ({ groups: await rows(`SELECT g.*, (SELECT count(*)::int FROM employees e WHERE e.allowance_group_id=g.id) AS employee_count FROM allowance_groups g ORDER BY g.sort_order, g.name`) })));
router.post('/allowance-groups', api(async req => {
  needAtt(req); const name = str(req.body?.name); if (!name) bad('Nhập tên nhóm');
  const r = await one(`INSERT INTO allowance_groups(name, sort_order, note) VALUES($1,$2,$3) RETURNING id`, [name, Math.trunc(Number(req.body?.sortOrder) || 0), str(req.body?.note) || null]).catch(e => e.code === '23505' ? bad('Đã có nhóm trùng tên') : (() => { throw e; })());
  await audit(req, 'allowance_group.add', 'allowance_group', r.id, { name }); return { ok: true, id: r.id };
}));
router.patch('/allowance-groups/:id', api(async req => {
  needAtt(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ'); const b = req.body || {}, sets = [], p = [req.params.id], add = (c, v) => { p.push(v); sets.push(`${c}=$${p.length}`); };
  if ('name' in b) { if (!str(b.name)) bad('Nhập tên nhóm'); add('name', str(b.name)); } if ('note' in b) add('note', str(b.note) || null);
  if ('sortOrder' in b) add('sort_order', Math.trunc(Number(b.sortOrder) || 0)); if ('active' in b) add('active', b.active === true || b.active === 'true');
  if (!sets.length) bad('Không có gì để cập nhật');
  await pool.query(`UPDATE allowance_groups SET ${sets.join(',')} WHERE id=$1`, p).catch(e => e.code === '23505' ? bad('Đã có nhóm trùng tên') : (() => { throw e; })());
  await markStale(pool); await audit(req, 'allowance_group.update', 'allowance_group', req.params.id, b); return { ok: true };
}));
router.delete('/allowance-groups/:id', api(async req => {
  needAtt(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  await pool.query('DELETE FROM allowance_groups WHERE id=$1', [req.params.id]); await markStale(pool); await audit(req, 'allowance_group.delete', 'allowance_group', req.params.id); return { ok: true };
}));
// % hưởng của ký hiệu theo nhóm phụ cấp: GET tất cả; PUT /code-rates/:code {kind, rates:[{groupId|null, pct}]} thay toàn bộ dòng của ký hiệu
router.get('/code-rates', api(async () => ({ rates: await rows(`SELECT r.id, r.code, r.allowance_group_id, r.pct FROM code_pay_rates r ORDER BY r.code`) })));
router.put('/code-rates/:code', api(async req => {
  needAtt(req); const code = req.params.code, b = req.body || {};
  if (!(await one('SELECT 1 AS x FROM attendance_codes WHERE code=$1', [code]))) bad('Không tìm thấy ký hiệu', 404);
  const kind = b.kind === '' || b.kind == null ? null : ['night', 'extra'].includes(b.kind) ? b.kind : bad('Nhóm tăng không hợp lệ');
  const rates = Array.isArray(b.rates) ? b.rates : []; const seen = new Set();
  for (const r of rates) { if (r.groupId && !isUuid(r.groupId)) bad('Nhóm phụ cấp không hợp lệ'); const k = r.groupId || ''; if (seen.has(k)) bad('Một nhóm chỉ được có một dòng %'); seen.add(k); const n = Number(r.pct); if (!(n >= 0 && n <= 2000)) bad('% phải từ 0 đến 2000'); }
  if (rates.length && !kind) bad('Chọn loại tăng (làm đêm / làm thêm – sửa chữa) trước khi nhập %');
  const { tx } = require('../db');
  await tx(async c => {
    await c.query('UPDATE attendance_codes SET pct_kind=$2 WHERE code=$1', [code, kind]);
    await c.query('DELETE FROM code_pay_rates WHERE code=$1', [code]);
    for (const r of rates) await c.query('INSERT INTO code_pay_rates(code, allowance_group_id, pct) VALUES($1,$2,$3)', [code, r.groupId || null, Number(r.pct)]);
  });
  await markStale(pool); await audit(req, 'code_rates.set', 'attendance_code', code, { kind, rates });
  return { ok: true };
}));
// ===== Hệ số hoàn thành kế hoạch (toàn công ty, theo tháng): thưởng = hệ số thưởng × đơn giá × hệ số này =====
router.get('/plan-factors', api(async req => {
  if (!req.auth.isAdmin && !(req.auth.assignments || []).length) bad('Bạn không có quyền xem', 403);
  const y = yearOf(req.query.year);
  const list = await rows('SELECT month, factor, note, updated_at FROM plan_factors WHERE year=$1 ORDER BY month', [y]);
  const lk = new Set((await rows(`SELECT DISTINCT month FROM payroll_runs WHERE year=$1 AND status='locked'`, [y])).map(r => r.month));
  return { year: y, months: Array.from({ length: 12 }, (_, i) => { const r = list.find(x => x.month === i + 1); return { month: i + 1, locked: lk.has(i + 1), factor: r ? Number(r.factor) : null, note: r?.note || '', updated_at: r?.updated_at || null }; }) };
}));
router.put('/plan-factors/:year/:month', api(async req => {
  needHr(req); const y = yearOf(req.params.year), m = Math.trunc(Number(req.params.month));
  if (!(m >= 1 && m <= 12)) bad('Tháng không hợp lệ');
  if (await one(`SELECT 1 AS x FROM payroll_runs WHERE year=$1 AND month=$2 AND status='locked' LIMIT 1`, [y, m])) bad(`Tháng ${m}/${y} đã được Giám đốc khoá bảng lương nên không đổi được hệ số hoàn thành kế hoạch. Muốn sửa, Admin phải mở khoá bảng lương của tháng đó trước.`, 409);
  const raw = req.body?.factor;
  if (raw === '' || raw === null || raw === undefined) {   // để trống = xoá (về mặc định 1)
    await pool.query('DELETE FROM plan_factors WHERE year=$1 AND month=$2', [y, m]);
  } else {
    const f = Number(raw); if (!Number.isFinite(f) || f < 0 || f > 10) bad('Hệ số hoàn thành kế hoạch phải từ 0 đến 10 (vd 1 = hoàn thành 100%, 0,9 = 90%)');
    await pool.query(`INSERT INTO plan_factors(year, month, factor, note, updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT (year, month) DO UPDATE SET factor=EXCLUDED.factor, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by, updated_at=now()`, [y, m, f, str(req.body?.note) || null, req.auth.user.id]);
  }
  await markStale(pool); await audit(req, 'plan_factor.set', 'plan_factor', `${y}-${m}`, { factor: raw });
  return { ok: true };
}));
module.exports = router;
