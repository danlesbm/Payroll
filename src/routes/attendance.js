const router = require('express').Router();
const { pool, rows, one, tx } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api, sendXlsx, slug, forbid } = require('../lib/http');
const X = require('../services/exports');
const { TRANSITIONS, STATUS_LABEL, nextStatus, editorRole } = require('../lib/workflow');
const { isMonthOpen, daysInMonth, validYM, nowVN } = require('../lib/dates');
const { recalcIfExists, autoCalc } = require('../services/payroll');
const { safetyHolders } = require('../services/safety');
const { monthEnd } = require('../lib/dates');
const sched = require('../services/schedule');
const { posTitle } = require('../lib/names');

const VIEW_ROLES = ['timekeeper', 'l1', 'l2', 'l3', 'director', 'view_att'];
// Các bước ở cấp bảng chấm công (người chấm, cấp 1, trả lại). Từ cấp 2 trở lên làm ở trang Bảng lương (theo cả bảng lương).
const SHEET_ACTIONS = ['submit', 'l1_approve', 'l1_return', 'l2_return'];
const ctxOf = p => ({ sheetId: p.sheet_id, groupId: p.group_id });
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);

async function loadPeriod(c, id, lock = false) {
  if (!isUuid(id)) bad('Mã bảng chấm công không hợp lệ');
  const p = (await q(c, `SELECT p.*, s.name AS sheet_name, s.group_id, s.meal_mode FROM periods p JOIN sheets s ON s.id=p.sheet_id WHERE p.id=$1 ${lock ? 'FOR UPDATE OF p' : ''}`, [id]))[0];
  if (!p) bad('Không tìm thấy bảng chấm công', 404);
  return p;
}
// Tạo kỳ nếu chưa có; khi còn "draft" thì đồng bộ danh sách nhân sự theo cấu hình hiện tại
async function ensurePeriod(c, sheetId, year, month) {
  const p = (await q(c, `INSERT INTO periods(sheet_id, year, month) VALUES($1,$2,$3) ON CONFLICT (sheet_id, year, month) DO UPDATE SET sheet_id=EXCLUDED.sheet_id RETURNING *`, [sheetId, year, month]))[0];
  if (p.status === 'draft') {
    await c.query(`INSERT INTO period_employees(period_id, employee_id) SELECT $1, v.id FROM v_employees v
      WHERE v.sheet_id=$2 AND v.sso_status='active' AND v.payroll_active ON CONFLICT DO NOTHING`, [p.id, sheetId]);
    await c.query(`DELETE FROM period_employees pe WHERE pe.period_id=$1
      AND NOT EXISTS (SELECT 1 FROM attendance_entries ae WHERE ae.period_id=pe.period_id AND ae.employee_id=pe.employee_id)
      AND NOT EXISTS (SELECT 1 FROM meal_actual ma WHERE ma.period_id=pe.period_id AND ma.employee_id=pe.employee_id)
      AND pe.employee_id NOT IN (SELECT v.id FROM v_employees v WHERE v.sheet_id=$2 AND v.sso_status='active' AND v.payroll_active)`, [p.id, sheetId]);
  }
  return p;
}
// Trả về { role, depts }: depts = null nếu sửa được toàn bảng; Set các bộ phận nếu chỉ được sửa một số bộ phận (phạm vi 'department')
function ensureEditable(req, p) {
  if (!isMonthOpen(p.year, p.month)) bad(`Tháng ${p.month}/${p.year} chưa đến nên chưa mở chấm công`, 409);
  const role = editorRole(p.status);
  if (!role) bad(`Bảng đang ở trạng thái "${STATUS_LABEL[p.status]}" nên chỉ xem, không sửa được`, 409);
  if (req.auth.can(role, ctxOf(p))) return { role, depts: null };
  if (role === 'timekeeper') { const d = req.auth.deptIds(['timekeeper']); if (d.size) return { role, depts: d }; }
  forbid(role === 'timekeeper' ? 'Bạn không phải người chấm công của bảng này' : `Ở giai đoạn "${STATUS_LABEL[p.status]}" chỉ ${({ l1: 'cấp 1', l2: 'cấp 2', l3: 'cấp 3 / Giám đốc' })[role] || 'người có quyền'} mới sửa được`);
}
// Phạm vi XEM một bảng chấm công: null = không được xem; { depts: null } = xem cả bảng; { depts: Set } = chỉ một số bộ phận
async function viewScope(req, sheetId, groupId, c = pool) {
  if (req.auth.canAny(VIEW_ROLES, { sheetId, groupId })) return { depts: null };
  const d = req.auth.deptIds(['timekeeper', 'view_att']);
  if (!d.size) return null;
  const mine = (await c.query('SELECT id FROM departments WHERE sheet_id=$1 AND id = ANY($2::uuid[])', [sheetId, [...d]])).rows.map(r => String(r.id));
  return mine.length ? { depts: new Set(mine) } : null;
}
// Những nhân sự trong kỳ mà người dùng được sửa (depts = null: tất cả)
async function editableRoster(c, p, depts) {
  const r = await q(c, 'SELECT pe.employee_id, ve.department_id FROM period_employees pe JOIN v_employees ve ON ve.id=pe.employee_id WHERE pe.period_id=$1', [p.id]);
  return new Set(r.filter(x => !depts || depts.has(String(x.department_id))).map(x => x.employee_id));
}

router.get('/sheets', api(async req => {
  const { year, month } = req.query;
  if (!validYM(year, month)) bad('Năm/tháng không hợp lệ');
  const sheets = await rows(`SELECT s.id, s.code, s.name, s.group_id, s.meal_mode, g.name AS group_name,
      (SELECT count(*)::int FROM v_employees v WHERE v.sheet_id=s.id AND v.sso_status='active' AND v.payroll_active) AS employee_count
    FROM sheets s JOIN groups g ON g.id=s.group_id WHERE s.active AND g.active ORDER BY g.sort_order, g.name, s.sort_order, s.name`);
  const pm = new Map((await rows('SELECT id, sheet_id, status FROM periods WHERE year=$1 AND month=$2', [year, month])).map(p => [p.sheet_id, p]));
  const dsheet = req.auth.deptIds(['timekeeper', 'view_att']).size ? new Set((await rows('SELECT sheet_id FROM departments WHERE id = ANY($1::uuid[])', [[...req.auth.deptIds(['timekeeper', 'view_att'])]])).map(r => r.sheet_id)) : new Set();
  const out = sheets.filter(s => dsheet.has(s.id) || req.auth.canAny(VIEW_ROLES, { sheetId: s.id, groupId: s.group_id })).map(s => {
    const p = pm.get(s.id);
    return { ...s, periodId: p?.id || null, status: p?.status || 'not_started', statusLabel: p ? STATUS_LABEL[p.status] : 'Chưa tạo' };
  });
  return { open: isMonthOpen(Number(year), Number(month)), now: nowVN(), sheets: out };
}));

router.get('/:sheetId/:year/:month', api(async req => {
  const { sheetId } = req.params; const year = Number(req.params.year), month = Number(req.params.month);
  if (!isUuid(sheetId) || !validYM(year, month)) bad('Tham số không hợp lệ');
  const sheet = await one(`SELECT s.*, g.name AS group_name, g.kind AS group_kind FROM sheets s JOIN groups g ON g.id=s.group_id WHERE s.id=$1`, [sheetId]);
  if (!sheet) bad('Không tìm thấy bảng chấm công', 404);
  const ctx = { sheetId, groupId: sheet.group_id };
  const vs = await viewScope(req, sheetId, sheet.group_id);
  if (!vs) bad('Bạn không được phân quyền với bảng chấm công này', 403);
  const open = isMonthOpen(year, month);
  const base = { sheet: { id: sheet.id, name: sheet.name, group_name: sheet.group_name, meal_mode: sheet.meal_mode, use_safety: sheet.use_safety, use_labor: sheet.use_labor, group_kind: sheet.group_kind }, year, month, days: daysInMonth(year, month), open };
  if (!open && !(await one('SELECT id FROM periods WHERE sheet_id=$1 AND year=$2 AND month=$3', [sheetId, year, month])))
    return { ...base, period: null, message: `Tháng ${month}/${year} chưa đến nên chưa mở chấm công.` };
  const data = await tx(async c => {
    const p = open ? await ensurePeriod(c, sheetId, year, month) : (await q(c, 'SELECT * FROM periods WHERE sheet_id=$1 AND year=$2 AND month=$3', [sheetId, year, month]))[0];
    return {
      p,
      employees: await q(c, `SELECT ve.id, ve.full_name, ve.employee_code, ve.positions, ve.title, ve.title_manual, ve.employee_type, ve.shift_no, ve.is_lead, ve.department_name, ve.weekly_off, ve.pay_dept_id, ve.department_id AS att_dept_id, (SELECT d.meal_mode FROM departments d WHERE d.id=ve.department_id) AS meal_mode FROM period_employees pe JOIN v_employees ve ON ve.id=pe.employee_id
        WHERE pe.period_id=$1 ORDER BY ve.department_sort NULLS LAST, ve.department_name NULLS LAST, ve.emp_order, ve.sort_order, ve.full_name`, [p.id]),
      entries: await q(c, 'SELECT employee_id, day, code FROM attendance_entries WHERE period_id=$1', [p.id]),
      original: await q(c, 'SELECT employee_id, day, code FROM attendance_original WHERE period_id=$1', [p.id]),
      meals: await q(c, 'SELECT employee_id, meal_type_id, day, quantity, code FROM meal_actual WHERE period_id=$1', [p.id]),
      ratings: await q(c, 'SELECT employee_id, safety, labor FROM period_ratings WHERE period_id=$1', [p.id])
    };
  });
  const { p } = data;
  // Chức danh hiển thị (giống bảng lương)
  const stT = Object.fromEntries((await rows("SELECT key, value FROM settings WHERE key IN ('plant_title_head','plant_title_deputy')")).map(r => [r.key, r.value]));
  data.employees.forEach(e => { e.pos_disp = posTitle(e, sheet.group_kind, stT); });
  if (vs.depts) {   // người chỉ có quyền theo bộ phận: chỉ thấy nhân sự của các bộ phận đó
    const ok = new Set(data.employees.filter(e => vs.depts.has(String(e.att_dept_id))).map(e => e.id));
    data.employees = data.employees.filter(e => ok.has(e.id));
    for (const k of ['entries', 'original', 'meals', 'ratings']) data[k] = data[k].filter(r => ok.has(r.employee_id));
  }
  const toMap = list => { const m = {}; for (const e of list) (m[e.employee_id] ||= {})[e.day] = e.code; return m; };
  // Ô bảng chấm ăn ca: ký hiệu công (mới) hoặc số suất (dữ liệu cũ nhập số)
  const meal = {}; for (const e of data.meals) ((meal[e.meal_type_id] ||= {})[e.employee_id] ||= {})[e.day] = e.code || Number(e.quantity);
  const role = editorRole(p.status);
  const fullEdit = open && !!role && req.auth.can(role, ctx);
  const tkDepts = !fullEdit && open && role === 'timekeeper' ? req.auth.deptIds(['timekeeper']) : new Set();
  const canEdit = fullEdit || (tkDepts.size > 0 && data.employees.some(e => tkDepts.has(String(e.att_dept_id))));
  const actions = SHEET_ACTIONS.filter(a => TRANSITIONS[a].from.includes(p.status) && req.auth.can(TRANSITIONS[a].role, ctx))
    .map(a => ({ key: a, label: TRANSITIONS[a].label, needNote: !!TRANSITIONS[a].needNote }));
  const holders = await safetyHolders(pool, data.employees.map(e => e.id), monthEnd(year, month));
  const sctx = await sched.loadContext(pool, year, month);
  const gmInfo = await sched.groupMin(pool, sctx, sheet.group_id);
  data.employees = data.employees.map(({ weekly_off, pay_dept_id, att_dept_id, ...e }) => {
    const sc = sched.forEmployee(sctx, { groupId: sheet.group_id, departmentId: pay_dept_id, employeeType: e.employee_type, weeklyOff: weekly_off, groupMin: e.shift_no && gmInfo ? (gmInfo[pay_dept_id || '']?.min ?? null) : null });
    return { ...e, editable: fullEdit || tkDepts.has(String(att_dept_id)), has_safety: holders.has(e.id), sch: { standard: sc.standard, min: sc.min, weeklyOff: sc.weeklyOff, source: sc.source, offDays: sc.info.offDays, otSalary: sc.otSalary, basis: sc.basis, groupMin: sc.groupMinMode } };
  });
  base.sheet.show_safety = !!sheet.use_safety || holders.size > 0;
  return { ...base, partial: !!vs.depts, groupMin: gmInfo, holidays: sctx.holidayList, period: { id: p.id, status: p.status, statusLabel: STATUS_LABEL[p.status], note: p.note, submitted_at: p.submitted_at, received_at: p.received_at, final_at: p.final_at },
    employees: data.employees, ratings: Object.fromEntries(data.ratings.map(r => [r.employee_id, { safety: r.safety || '', labor: r.labor || '' }])),
    laborGrades: await rows('SELECT grade, factor FROM labor_grades ORDER BY sort_order, grade'), safetyGrades: (await rows('SELECT grade FROM safety_grades ORDER BY sort_order, grade')).map(x => x.grade),
    entries: toMap(data.entries), original: data.original.length && p.status !== 'draft' ? toMap(data.original) : null, mealActual: meal,
    codes: await rows('SELECT code, name, work_value, work_day, work_night, color, off_day_zero AS off_zero, is_ot, pay_scope, pct_kind, meal_qty FROM attendance_codes WHERE active ORDER BY sort_order, code'),
    mealQty: Object.fromEntries((await rows('SELECT code, meal_qty FROM attendance_codes')).map(r => [r.code, Number(r.meal_qty)])),
    mealTypes: await rows('SELECT id, code, name, is_wait FROM meal_types WHERE active ORDER BY sort_order, name'),
    canEdit, editRole: role, actions,
    nextStep: ({ pending_l1: 'Cấp 1 có thể sửa công/xếp loại rồi bấm "Cấp 1 duyệt, trình cấp 2" (mọi chỉnh sửa được lưu kèm).', pending_l2: 'Cấp 2 có thể sửa công và chạy lương nháp ở trang Bảng lương; xong bấm "Cấp 2 chốt, trình cấp 3" ở trang Bảng lương.', pending_l3: 'Cấp 3 có thể sửa công; xong bấm "Cấp 3 chốt, trình Giám đốc" ở trang Bảng lương.', pending_dir: 'Đang chờ Giám đốc khoá ở trang Bảng lương. Không ai sửa được.' })[p.status] || '' };
}));

// Xuất Excel bảng chấm công: 1 bảng, hoặc toàn bộ bảng chấm công của một bảng lương (mỗi bảng 1 trang tính)
router.get('/export/group/:groupId/:year/:month', async (req, res) => {
  const year = Number(req.params.year), month = Number(req.params.month);
  if (!isUuid(req.params.groupId) || !validYM(year, month)) bad('Tham số không hợp lệ');
  const g = await one('SELECT name FROM groups WHERE id=$1', [req.params.groupId]); if (!g) bad('Không tìm thấy bảng lương', 404);
  const sheets = (await rows('SELECT id, group_id FROM sheets WHERE group_id=$1 AND active ORDER BY sort_order, name', [req.params.groupId])).filter(sh => req.auth.canAny(VIEW_ROLES, { sheetId: sh.id, groupId: sh.group_id }));
  if (!sheets.length) bad('Bạn không được phân quyền xem bảng chấm công nào của bảng lương này (xuất Excel yêu cầu quyền theo bảng)', 403);
  sendXlsx(res, await X.attendanceXlsx(pool, sheets.map(x => x.id), year, month), `bang-cham-cong-${slug(g.name)}-${year}-${String(month).padStart(2, '0')}.xlsx`);
});
router.get('/:sheetId/:year/:month/export', async (req, res) => {
  const { sheetId } = req.params, year = Number(req.params.year), month = Number(req.params.month);
  if (!isUuid(sheetId) || !validYM(year, month)) bad('Tham số không hợp lệ');
  const sh = await one('SELECT id, name, group_id FROM sheets WHERE id=$1', [sheetId]); if (!sh) bad('Không tìm thấy bảng chấm công', 404);
  if (!req.auth.canAny(VIEW_ROLES, { sheetId, groupId: sh.group_id })) bad('Bạn không được phân quyền với bảng chấm công này (xuất Excel cần quyền xem cả bảng, không áp dụng cho phân quyền theo bộ phận)', 403);
  sendXlsx(res, await X.attendanceXlsx(pool, [sheetId], year, month), `bang-cham-cong-${slug(sh.name)}-${year}-${String(month).padStart(2, '0')}.xlsx`);
});
// Xếp loại an toàn tháng (A/B/C) và xếp loại lao động (A–E) của từng người trong kỳ — sửa theo cùng quy tắc với ô công
router.post('/:periodId/ratings', api(async req => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : bad('Thiếu danh sách thay đổi');
  return tx(async c => {
    const p = await loadPeriod(c, req.params.periodId, true);
    const { depts } = ensureEditable(req, p);
    const sh = (await q(c, 'SELECT use_safety, use_labor FROM sheets WHERE id=$1', [p.sheet_id]))[0];
    const roster = await editableRoster(c, p, depts);
    const lg = new Set((await q(c, 'SELECT grade FROM labor_grades')).map(r => r.grade)), sg = new Set((await q(c, 'SELECT grade FROM safety_grades')).map(r => r.grade));
    const uid = req.auth.user.id; let changed = 0;
    for (const ch of changes) {
      if (!roster.has(ch.employeeId)) bad('Có nhân sự không thuộc bảng chấm công này hoặc ngoài bộ phận bạn được phân quyền chấm');
      const cur = (await q(c, 'SELECT safety, labor FROM period_ratings WHERE period_id=$1 AND employee_id=$2', [p.id, ch.employeeId]))[0] || {};
      let safety = cur.safety || null, labor = cur.labor || null;
      if ('safety' in ch) { const v = str(ch.safety) || null; if (v && !sg.has(v)) bad(`Xếp loại an toàn "${v}" không hợp lệ`); safety = v; }
      if ('labor' in ch) { if (!sh.use_labor) bad('Bảng chấm công này không chấm xếp loại lao động'); const v = str(ch.labor) || null; if (v && !lg.has(v)) bad(`Xếp loại lao động "${v}" không hợp lệ`); labor = v; }
      if ((cur.safety || null) === safety && (cur.labor || null) === labor) continue;
      await c.query(`INSERT INTO period_ratings(period_id, employee_id, safety, labor, updated_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT (period_id, employee_id) DO UPDATE SET safety=EXCLUDED.safety, labor=EXCLUDED.labor, updated_by=EXCLUDED.updated_by, updated_at=now()`, [p.id, ch.employeeId, safety, labor, uid]);
      if ((cur.safety || null) !== safety) await c.query(`INSERT INTO attendance_changes(period_id, employee_id, field, old_value, new_value, stage, changed_by) VALUES($1,$2,'safety',$3,$4,$5,$6)`, [p.id, ch.employeeId, cur.safety || null, safety, p.status, uid]);
      if ((cur.labor || null) !== labor) await c.query(`INSERT INTO attendance_changes(period_id, employee_id, field, old_value, new_value, stage, changed_by) VALUES($1,$2,'labor',$3,$4,$5,$6)`, [p.id, ch.employeeId, cur.labor || null, labor, p.status, uid]);
      changed++;
    }
    await c.query('UPDATE periods SET updated_at=now() WHERE id=$1', [p.id]);
    if (changed) await autoCalc(c, p.sheet_id, p.year, p.month, uid);
    return { ok: true, changed };
  });
}));
router.post('/:periodId/cells', api(async req => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : bad('Thiếu danh sách thay đổi');
  if (changes.length > 6000) bad('Quá nhiều thay đổi trong một lần lưu');
  return tx(async c => {
    const p = await loadPeriod(c, req.params.periodId, true);
    const { depts } = ensureEditable(req, p);
    const max = daysInMonth(p.year, p.month);
    const roster = await editableRoster(c, p, depts);
    const codes = new Set((await q(c, 'SELECT code FROM attendance_codes WHERE active')).map(r => r.code));
    const cur = new Map((await q(c, 'SELECT employee_id, day, code FROM attendance_entries WHERE period_id=$1', [p.id])).map(r => [r.employee_id + ':' + r.day, r.code]));
    const uid = req.auth.user.id; let changed = 0;
    for (const ch of changes) {
      const day = Number(ch.day), code = str(ch.code);
      if (!roster.has(ch.employeeId)) bad('Có nhân sự không thuộc bảng chấm công này hoặc ngoài bộ phận bạn được phân quyền chấm');
      if (!Number.isInteger(day) || day < 1 || day > max) bad(`Ngày ${ch.day} không hợp lệ cho tháng ${p.month}/${p.year}`);
      if (code && !codes.has(code)) bad(`Ký hiệu công "${code}" không tồn tại hoặc đã ngừng dùng`);
      const old = cur.get(ch.employeeId + ':' + day) || null;
      if ((code || null) === old) continue;
      if (!code) await c.query('DELETE FROM attendance_entries WHERE period_id=$1 AND employee_id=$2 AND day=$3', [p.id, ch.employeeId, day]);
      else await c.query(`INSERT INTO attendance_entries(period_id, employee_id, day, code, updated_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT (period_id, employee_id, day) DO UPDATE SET code=EXCLUDED.code, updated_by=EXCLUDED.updated_by, updated_at=now()`, [p.id, ch.employeeId, day, code, uid]);
      await c.query(`INSERT INTO attendance_changes(period_id, employee_id, day, field, old_value, new_value, stage, changed_by) VALUES($1,$2,$3,'code',$4,$5,$6,$7)`,
        [p.id, ch.employeeId, day, old, code || null, p.status, uid]);
      changed++;
    }
    await c.query('UPDATE periods SET updated_at=now() WHERE id=$1', [p.id]);
    if (changed) await autoCalc(c, p.sheet_id, p.year, p.month, uid);
    return { ok: true, changed };
  });
}));

router.post('/:periodId/meal-cells', api(async req => {
  const mealTypeId = req.body?.mealTypeId;
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : bad('Thiếu danh sách thay đổi');
  if (!isUuid(mealTypeId)) bad('Chưa chọn loại suất ăn');
  return tx(async c => {
    const p = await loadPeriod(c, req.params.periodId, true);
    const { depts } = ensureEditable(req, p);
    const max = daysInMonth(p.year, p.month);
    const roster = await editableRoster(c, p, depts);
    const mt = (await q(c, 'SELECT is_wait FROM meal_types WHERE id=$1 AND active', [mealTypeId]))[0]; if (!mt) bad('Loại suất ăn không tồn tại hoặc đã ngừng dùng');
    const modeOf = new Map((await q(c, `SELECT ve.id, (SELECT d.meal_mode FROM departments d WHERE d.id=ve.department_id) AS m FROM period_employees pe JOIN v_employees ve ON ve.id=pe.employee_id WHERE pe.period_id=$1`, [p.id])).map(r => [r.id, r.m || 'auto']));
    // Mỗi ô: ký hiệu công (code) hoặc số suất (qty, dữ liệu cũ). Ký hiệu được tính số suất theo cột "Suất ăn" của ký hiệu (Cấu hình › Ký hiệu công)
    const cur = new Map((await q(c, 'SELECT employee_id, day, quantity, code FROM meal_actual WHERE period_id=$1 AND meal_type_id=$2', [p.id, mealTypeId])).map(r => [r.employee_id + ':' + r.day, r.code || Number(r.quantity)]));
    const codeOk = new Set((await q(c, 'SELECT code FROM attendance_codes WHERE active')).map(r => r.code));
    const uid = req.auth.user.id; let changed = 0;
    for (const ch of changes) {
      const day = Number(ch.day), code = typeof ch.code === 'string' ? ch.code.trim() : '';
      const qty = code ? 0 : ch.qty === null || ch.qty === '' || ch.qty === undefined ? 0 : Number(ch.qty);
      if (!roster.has(ch.employeeId)) bad('Có nhân sự không thuộc bảng chấm công này hoặc ngoài bộ phận bạn được phân quyền chấm');
      if (!Number.isInteger(day) || day < 1 || day > max) bad(`Ngày ${ch.day} không hợp lệ`);
      if (code && !codeOk.has(code)) bad(`Ký hiệu "${code}" không tồn tại hoặc đã ngừng dùng`);
      if (!Number.isFinite(qty) || qty < 0 || qty > 10) bad('Số suất ăn phải từ 0 đến 10');
      const md = modeOf.get(ch.employeeId); if (!(md === 'actual' && !mt.is_wait) && !(md === 'auto_wait' && mt.is_wait)) bad('Bộ phận của người này không chấm ăn ca theo bảng này (xem kiểu ăn ca ở Quản trị › Tổ chức & liên kết SSO)');
      const old = cur.get(ch.employeeId + ':' + day) || 0, nv = code || qty;
      if (nv === old) continue;
      if (!nv) await c.query('DELETE FROM meal_actual WHERE period_id=$1 AND employee_id=$2 AND meal_type_id=$3 AND day=$4', [p.id, ch.employeeId, mealTypeId, day]);
      else await c.query(`INSERT INTO meal_actual(period_id, employee_id, meal_type_id, day, quantity, code) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (period_id, employee_id, meal_type_id, day) DO UPDATE SET quantity=EXCLUDED.quantity, code=EXCLUDED.code`, [p.id, ch.employeeId, mealTypeId, day, qty, code || null]);
      await c.query(`INSERT INTO attendance_changes(period_id, employee_id, day, field, old_value, new_value, stage, changed_by) VALUES($1,$2,$3,'meal',$4,$5,$6,$7)`,
        [p.id, ch.employeeId, day, old ? String(old) : '', nv ? String(nv) : '', p.status, uid]);
      changed++;
    }
    if (changed) await autoCalc(c, p.sheet_id, p.year, p.month, uid);
    return { ok: true, changed };
  });
}));

router.post('/:periodId/action', api(async req => {
  const action = str(req.body?.action), note = str(req.body?.note);
  if (!SHEET_ACTIONS.includes(action)) bad('Thao tác này thực hiện ở trang Bảng lương (cấp 2 trở lên)');
  const T = TRANSITIONS[action];
  const result = await tx(async c => {
    const p = await loadPeriod(c, req.params.periodId, true);
    req.auth.need(T.role, ctxOf(p), `Bạn không có quyền "${T.label}" cho bảng này`);
    if (T.needNote && !note) bad('Vui lòng nhập lý do trả lại');
    if (action === 'submit' && !isMonthOpen(p.year, p.month)) bad('Tháng này chưa đến', 409);
    const reqL1 = ((await q(c, `SELECT value FROM settings WHERE key='require_l1'`))[0]?.value ?? 'true') !== 'false';
    const to = nextStatus(action, p.status, { requireL1: reqL1 });
    if (action === 'submit' && !(await q(c, 'SELECT 1 FROM period_employees WHERE period_id=$1 LIMIT 1', [p.id])).length) bad('Bảng chưa có nhân sự nào (kiểm tra cấu hình phòng ban ↔ SSO)');
    if (action === 'submit') {   // lưu bản gốc của người chấm gửi lên để đối chiếu các chỉnh sửa của cấp trên
      await c.query('DELETE FROM attendance_original WHERE period_id=$1', [p.id]);
      await c.query('INSERT INTO attendance_original(period_id, employee_id, day, code) SELECT period_id, employee_id, day, code FROM attendance_entries WHERE period_id=$1', [p.id]);
    }
    const uid = req.auth.user.id;
    await c.query(`UPDATE periods SET status=$2, note=$3, updated_at=now(),
      submitted_by = CASE WHEN $4::text='submit' THEN $5 ELSE submitted_by END, submitted_at = CASE WHEN $4::text='submit' THEN now() ELSE submitted_at END,
      l1_by = CASE WHEN $4::text='l1_approve' THEN $5 ELSE l1_by END, l1_at = CASE WHEN $4::text='l1_approve' THEN now() ELSE l1_at END,
      received_by = CASE WHEN $4::text='l1_approve' THEN $5 ELSE received_by END, received_at = CASE WHEN $4::text='l1_approve' THEN now() ELSE received_at END
      WHERE id=$1`, [p.id, to, note || null, action, uid]);
    await c.query(`INSERT INTO attendance_changes(period_id, field, old_value, new_value, stage, changed_by) VALUES($1,'status',$2,$3,$4,$5)`, [p.id, p.status, to + (note ? ' — ' + note : ''), action, uid]);
    await autoCalc(c, p.sheet_id, p.year, p.month, uid);   // trạng thái đổi (vd bảng được cấp 2 nhận) -> cập nhật ghi chú "tạm tính"
    return { ok: true, status: to, statusLabel: STATUS_LABEL[to], periodId: p.id, from: p.status };
  });
  await audit(req, 'attendance.' + action, 'period', result.periodId, { from: result.from, to: result.status, note });
  return result;
}));

router.get('/:periodId/history', api(async req => {
  const p = await loadPeriod(pool, req.params.periodId);
  const vs = await viewScope(req, p.sheet_id, p.group_id);
  if (!vs) bad('Bạn không được xem bảng này', 403);
  const ok = vs.depts ? await editableRoster(pool, p, vs.depts) : null;
  const items = await rows(`SELECT ac.id, ac.employee_id, ac.day, ac.field, ac.old_value, ac.new_value, ac.stage, ac.changed_at, e.full_name AS employee_name, u.full_name AS changed_by_name
    FROM attendance_changes ac LEFT JOIN employees e ON e.id=ac.employee_id LEFT JOIN employees u ON u.sso_user_id=ac.changed_by
    WHERE ac.period_id=$1 ORDER BY ac.changed_at DESC, ac.id DESC LIMIT 500`, [p.id]);
  return { items: (ok ? items.filter(i => i.employee_id && ok.has(i.employee_id)) : items).map(({ employee_id, ...r }) => r) };
}));
module.exports = router;
