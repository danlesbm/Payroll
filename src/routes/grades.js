// Bậc lương bảo hiểm, lịch sử tăng/giảm hệ số, cảnh báo đến hạn tăng bậc.
const router = require('express').Router();
const { rows, pool } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api, forbid, sendXlsx } = require('../lib/http');
const { Workbook } = require('../lib/xlsx');
const { nowVN } = require('../lib/dates');
const G = require('../services/grades');
const { posTitle } = require('../lib/names');
const titleSettings = async () => Object.fromEntries((await rows("SELECT key, value FROM settings WHERE key IN ('plant_title_head','plant_title_deputy')")).map(r => [r.key, r.value]));

const PAY_ROLES = ['l2', 'l3', 'director', 'hr', 'view_pay'];
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const n = nowVN(); return `${n.year}-${pad(n.month)}-${pad(n.day)}`; };
const dateOk = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
const num = v => Number(v || 0);
const r4 = v => Math.round(v * 10000) / 10000;
const anyPay = req => req.auth.isAdmin || req.auth.assignments.some(a => PAY_ROLES.includes(a.role));

// Nhân sự trong phạm vi mà người dùng được xem (theo bảng lương / bảng chấm công được phân quyền)
async function scopeEmployees(req, { groupId, departmentId, q } = {}) {
  const p = [], w = [`v.sso_status='active'`, 'v.payroll_active', 'v.group_id IS NOT NULL'];
  if (isUuid(groupId)) { p.push(groupId); w.push(`v.group_id=$${p.length}`); }
  if (isUuid(departmentId)) { p.push(departmentId); w.push(`v.pay_dept_id=$${p.length}`); }
  if (str(q)) { p.push('%' + str(q).toLowerCase() + '%'); w.push(`lower(v.full_name) LIKE $${p.length}`); }
  const list = await rows(`SELECT v.id, v.full_name, v.employee_code, v.positions, v.title, v.title_manual, v.is_lead, v.shift_no, v.employee_type, v.group_id, v.sheet_id, v.group_name, v.group_kind, v.pay_department_name AS dept
    FROM v_employees v WHERE ${w.join(' AND ')} ORDER BY v.group_name, v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, v.sort_order, v.full_name`, p);
  return list.filter(e => req.auth.canAny(PAY_ROLES, { groupId: e.group_id, sheetId: e.sheet_id }));
}

// ===== Thang bậc lương =====
router.get('/grades', api(async req => {
  if (!anyPay(req)) forbid('Bạn không được phân quyền xem');
  const cc = await G.coefCode();
  return { grades: await rows('SELECT scale, grade, coefficient, months_to_next, note FROM salary_grades ORDER BY scale, grade'), coefCode: cc.code, coefName: cc.name, coefTypes: cc.types,
    canEdit: req.auth.can('hr', {}) };
}));
router.put('/grades', api(async req => {
  req.auth.need('hr', {}, 'Chỉ Quản trị hoặc Quản lý hệ số (toàn hệ thống) mới sửa được thang bậc lương');
  const b = req.body || {}, scale = str(b.scale), grade = Math.trunc(Number(b.grade)), coef = Number(b.coefficient);
  if (!scale) bad('Nhập tên thang lương (vd: Chung, Kỹ thuật)');
  if (!(grade >= 1 && grade <= 99)) bad('Bậc phải từ 1 đến 99');
  if (!(coef >= 0 && coef <= 1000)) bad('Hệ số không hợp lệ');
  const m = b.monthsToNext === '' || b.monthsToNext === null || b.monthsToNext === undefined ? null : Math.trunc(Number(b.monthsToNext));
  if (m !== null && !(m >= 1 && m <= 600)) bad('Số tháng giữ bậc phải từ 1 đến 600 (để trống nếu là bậc cuối)');
  await pool.query(`INSERT INTO salary_grades(scale, grade, coefficient, months_to_next, note) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT (scale, grade) DO UPDATE SET coefficient=EXCLUDED.coefficient, months_to_next=EXCLUDED.months_to_next, note=EXCLUDED.note`, [scale, grade, coef, m, str(b.note) || null]);
  await audit(req, 'grade.save', 'salary_grades', `${scale}|${grade}`, { coef, months: m });
  return { ok: true };
}));
router.delete('/grades/:scale/:grade', api(async req => {
  req.auth.need('hr', {}, 'Chỉ Quản trị hoặc Quản lý hệ số (toàn hệ thống) mới xoá được bậc lương');
  await pool.query('DELETE FROM salary_grades WHERE scale=$1 AND grade=$2', [req.params.scale, Math.trunc(Number(req.params.grade))]);
  await audit(req, 'grade.delete', 'salary_grades', `${req.params.scale}|${req.params.grade}`, null);
  return { ok: true };
}));
router.put('/grade-coef', api(async req => {
  req.auth.need('hr', {}, 'Không đủ quyền');
  const code = str(req.body?.code);
  if (code && !(await rows('SELECT 1 FROM coefficient_types WHERE code=$1', [code])).length) bad('Loại hệ số không tồn tại');
  await pool.query(`INSERT INTO settings(key, value, updated_by) VALUES('grade_coef_code',$1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [code, req.auth.user.id]);
  await audit(req, 'grade.coef', 'settings', 'grade_coef_code', { code });
  return { ok: true };
}));

// ===== Lịch sử tăng / giảm hệ số =====
async function changes(req, q) {
  const emps = await scopeEmployees(req, q);
  if (!emps.length) return { rows: [], types: [] };
  const types = await rows('SELECT code, name, kind, is_total FROM coefficient_types ORDER BY sort_order, code');
  const tMap = new Map(types.map(t => [t.code, t]));
  const from = dateOk(q.from) || '1900-01-01', to = dateOk(q.to) || '2999-12-31';
  const kind = ['insurance', 'bonus', 'amount', 'ins_amount'].includes(q.kind) ? q.kind : 'all', withFirst = q.first === '1';
  const hist = await rows(`SELECT h.id, h.employee_id, to_char(h.effective_from,'YYYY-MM-DD') AS ef, h.vals, h.grade_scale, h.grade, h.note, u.full_name AS by_name
    FROM coefficient_history h LEFT JOIN employees u ON u.sso_user_id=h.created_by WHERE h.employee_id = ANY($1::uuid[]) ORDER BY h.employee_id, h.effective_from, h.id`, [emps.map(e => e.id)]);
  const eMap = new Map(emps.map(e => [e.id, e]));
  const sums = vals => { const o = { insurance: 0, bonus: 0, amount: 0, ins_amount: 0 }; for (const [k, v] of Object.entries(vals || {})) { const t = tMap.get(k); if (t && !t.is_total) o[t.kind] += num(v); } for (const k of Object.keys(o)) o[k] = r4(o[k]); return o; };
  const out = []; let prev = null;
  for (const h of hist) {
    if (!prev || prev.employee_id !== h.employee_id) prev = null;
    const e = eMap.get(h.employee_id), a = sums(h.vals), b = prev ? sums(prev.vals) : null;
    const gA = G.gradeLabel(h.grade_scale, h.grade), gB = prev ? G.gradeLabel(prev.grade_scale, prev.grade) : '';
    const detail = [];
    const fv = (t, v) => t.kind === 'amount' || t.kind === 'ins_amount' ? Math.round(v).toLocaleString('vi-VN') : v;   // số tiền: có dấu chấm ngăn cách
    for (const t of types) { const x = num(h.vals?.[t.code]), y = prev ? num(prev.vals?.[t.code]) : 0; if (!prev ? x : x !== y) detail.push(`${t.name}: ${prev ? fv(t, y) : '—'} → ${fv(t, x)}`); }
    const ch = { insurance: !!b && Math.abs(a.insurance - b.insurance) > 1e-9, bonus: !!b && Math.abs(a.bonus - b.bonus) > 1e-9, amount: !!b && Math.abs(a.amount - b.amount) > 1e-9, ins_amount: !!b && Math.abs(a.ins_amount - b.ins_amount) > 1e-9, grade: !!b && gA !== gB };
    const keep = prev ? (kind === 'all' ? (ch.insurance || ch.bonus || ch.amount || ch.ins_amount || ch.grade) : (ch[kind] || (kind === 'insurance' && ch.grade))) : withFirst;
    if (keep && h.ef >= from && h.ef <= to) out.push({ id: h.id, employee_id: h.employee_id, name: e.full_name, code: e.employee_code, dept: e.dept, group: e.group_name, ef: h.ef, first: !prev,
      ins_before: b ? b.insurance : null, ins_after: a.insurance, bonus_before: b ? b.bonus : null, bonus_after: a.bonus, amount_before: b ? b.amount : null, amount_after: a.amount, ins_amount_before: b ? b.ins_amount : null, ins_amount_after: a.ins_amount,
      delta: b ? r4(a.insurance - b.insurance) : null, pct: b && b.insurance ? r4((a.insurance - b.insurance) / b.insurance * 100) : null,
      amt_delta: b ? Math.round(a.ins_amount - b.ins_amount) : null, amt_pct: b && b.ins_amount ? r4((a.ins_amount - b.ins_amount) / b.ins_amount * 100) : null, grade_before: gB, grade_after: gA, detail, note: h.note, by: h.by_name });
    prev = h;
  }
  out.sort((x, y) => y.ef.localeCompare(x.ef) || x.name.localeCompare(y.name, 'vi'));
  return { rows: out, types };
}
router.get('/coef-changes', api(async req => {
  if (!anyPay(req)) forbid('Bạn không được phân quyền xem');
  const r = await changes(req, req.query);
  const ups = r.rows.filter(x => x.delta > 0).length, downs = r.rows.filter(x => x.delta < 0).length;
  return { rows: r.rows.slice(0, 2000), total: r.rows.length, ups, downs };
}));
router.get('/coef-changes/export', async (req, res) => {
  if (!anyPay(req)) forbid('Bạn không được phân quyền xem');
  const r = await changes(req, req.query);
  const wb = new Workbook(), ws = wb.sheet('Lịch sử hệ số'), H = { b: true, fill: 'DDE7F7', border: true, al: 'center', wrap: true, va: 'center' }, C = { border: true }, N = { border: true, fmt: '#,##0.0000;-#,##0.0000;0' };
  ws.set(1, 1, 'LỊCH SỬ TĂNG / GIẢM HỆ SỐ', { b: true, sz: 13 });
  const heads = ['STT', 'Họ tên', 'Mã NV', 'Bộ phận', 'Bảng lương', 'Hiệu lực từ', 'Bậc cũ', 'Bậc mới', 'Hệ số BH cũ', 'Hệ số BH mới', 'Tăng/giảm', '%', 'Hệ số thưởng cũ', 'Hệ số thưởng mới', 'Chi tiết thay đổi', 'Ghi chú', 'Người nhập'];
  heads.forEach((t, i) => ws.set(3, i + 1, t, H)); ws.height(3, 32);
  [5, 24, 10, 20, 18, 12, 12, 12, 11, 11, 11, 8, 11, 11, 44, 24, 18].forEach((w, i) => ws.col(i + 1, w));
  r.rows.forEach((x, k) => { const row = 4 + k;
    [k + 1, x.name, x.code || '', x.dept || '', x.group || '', x.ef, x.grade_before, x.grade_after, x.ins_before, x.ins_after, x.delta, x.pct === null ? null : x.pct / 100, x.bonus_before, x.bonus_after, x.detail.join('; '), x.note || '', x.by || '']
      .forEach((v, i) => ws.set(row, i + 1, v, [8, 9, 10, 11, 12, 13].includes(i) ? (i === 11 ? { border: true, fmt: '0.0%' } : N) : C)); });
  ws.freeze = [3, 2];
  sendXlsx(res, wb.toBuffer(), 'lich-su-he-so.xlsx');
});

// ===== Đến hạn tăng bậc =====
async function dueList(req, q) {
  const emps = await scopeEmployees(req, q), today = todayStr(), stT = await titleSettings();
  const st = await G.states(today, emps.map(e => e.id));
  const from = dateOk(q.from) || '1900-01-01', to = dateOk(q.to) || '2999-12-31';
  const all = emps.map(e => ({ e, s: st.get(e.id) }));
  const list = all.filter(x => x.s?.grade && x.s.due && x.s.due >= from && x.s.due <= to).map(({ e, s }) => ({
    employee_id: e.id, name: e.full_name, code: e.employee_code, dept: e.dept, group: e.group_name, position: posTitle(e, e.group_kind, stT),
    label: s.label, scale: s.scale, grade: s.grade, since: s.since, months: s.months, due: s.due, days_left: G.daysBetween(today, s.due), overdue: s.due < today,
    cur_coef: s.curCoef, grade_coef: s.gradeCoef, next_grade: s.nextGrade, next_coef: s.nextCoef })).sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name, 'vi'));
  const overdueAll = all.filter(x => x.s?.due && x.s.due < today).length;
  const soon = all.filter(x => x.s?.due && x.s.due >= today && G.daysBetween(today, x.s.due) <= 30).length;
  return { today, list, overdueAll, soon, noGrade: all.filter(x => !x.s?.grade).length, total: all.length };
}
router.get('/grade-due', api(async req => { if (!anyPay(req)) forbid('Bạn không được phân quyền xem'); return dueList(req, req.query); }));
router.get('/grade-summary', api(async req => {
  if (!anyPay(req)) return { overdue: 0, soon: 0, noGrade: 0, total: 0 };
  const d = await dueList(req, { from: '2999-01-01', to: '2999-01-02' });
  return { overdue: d.overdueAll, soon: d.soon, noGrade: d.noGrade, total: d.total };
}));
router.get('/grade-due/export', async (req, res) => {
  if (!anyPay(req)) forbid('Bạn không được phân quyền xem');
  const d = await dueList(req, req.query);
  const wb = new Workbook(), ws = wb.sheet('Đến hạn tăng bậc'), H = { b: true, fill: 'DDE7F7', border: true, al: 'center', wrap: true, va: 'center' }, C = { border: true }, N = { border: true, fmt: '#,##0.0000;-#,##0.0000;0' };
  ws.set(1, 1, 'DANH SÁCH ĐẾN HẠN TĂNG BẬC LƯƠNG BẢO HIỂM', { b: true, sz: 13 });
  ws.set(2, 1, `Từ ${req.query.from || '—'} đến ${req.query.to || '—'} · lập ngày ${d.today}`, { i: true });
  ['STT', 'Họ tên', 'Mã NV', 'Bộ phận', 'Chức danh', 'Bậc hiện tại', 'Hưởng bậc từ', 'Số tháng giữ bậc', 'Đến hạn', 'Còn (ngày)', 'Hệ số BH hiện tại', 'Bậc kế tiếp', 'Hệ số bậc kế tiếp', 'Tình trạng'].forEach((t, i) => ws.set(4, i + 1, t, H));
  ws.height(4, 32); [5, 24, 10, 20, 20, 16, 12, 10, 12, 10, 12, 10, 12, 14].forEach((w, i) => ws.col(i + 1, w));
  d.list.forEach((x, k) => [k + 1, x.name, x.code || '', x.dept || '', x.position || '', x.label, x.since, x.months, x.due, x.days_left, x.cur_coef, x.next_grade ? 'Bậc ' + x.next_grade : 'Bậc cuối', x.next_coef, x.overdue ? 'QUÁ HẠN' : 'Sắp đến hạn']
    .forEach((v, i) => ws.set(5 + k, i + 1, v, [10, 12].includes(i) ? N : (x.overdue && i === 13 ? { ...C, b: true, color: 'B91C1C' } : C))));
  ws.freeze = [4, 2];
  sendXlsx(res, wb.toBuffer(), 'den-han-tang-bac.xlsx');
});
module.exports = router;
