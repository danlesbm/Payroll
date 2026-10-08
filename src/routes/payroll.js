const router = require('express').Router();
const { pool, rows, one, tx } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api } = require('../lib/http');
const { STATUS_LABEL, nextStatus } = require('../lib/workflow');
const { validYM, nowVN } = require('../lib/dates');
const { calculateRun, markStale, fixedMembers } = require('../services/payroll');
const { mealReport } = require('../services/meals');
const G = require('../services/grades');
const X = require('../services/exports');
const { sendXlsx, slug } = require('../lib/http');

const PAY_ROLES = ['l2', 'l3', 'director', 'hr', 'view_pay'];
const RUN_LABEL = { draft: 'Cấp 2 xử lý (lương nháp)', submitted: 'Cấp 3 kiểm soát', pending_dir: 'Chờ Giám đốc khoá', locked: 'Đã khoá' };
const pad2 = v => String(v).padStart(2, '0');
const q = (c, sql, p) => c.query(sql, p).then(r => r.rows);
const gctx = groupId => ({ groupId });
function ym(req) { const year = Number(req.params.year ?? req.query.year), month = Number(req.params.month ?? req.query.month); if (!validYM(year, month)) bad('Năm/tháng không hợp lệ'); return { year, month }; }
function groupParam(req) { if (!isUuid(req.params.groupId)) bad('Mã bảng lương không hợp lệ'); return req.params.groupId; }
async function groupSheets(c, groupId, year, month) {
  return q(c, `SELECT s.id, s.name, p.id AS period_id, p.status,
      (SELECT count(*)::int FROM v_employees v WHERE v.sheet_id=s.id AND v.sso_status='active' AND v.payroll_active) AS employee_count
    FROM sheets s LEFT JOIN periods p ON p.sheet_id=s.id AND p.year=$2 AND p.month=$3 WHERE s.group_id=$1 AND s.active ORDER BY s.sort_order, s.name`, [groupId, year, month]);
}
const relevant = list => list.filter(s => s.period_id || s.employee_count > 0);
const sheetOut = list => list.map(s => ({ id: s.id, name: s.name, status: s.status || 'not_started', statusLabel: s.status ? STATUS_LABEL[s.status] : 'Chưa tạo' }));

router.get('/groups', api(async req => {
  const { year, month } = ym(req);
  const out = [];
  for (const g of await rows(`SELECT id, code, name, kind, pay_type, (SELECT count(*)::int FROM employees e WHERE e.fixed_group_id=groups.id AND e.pay_mode='fixed' AND e.payroll_active AND e.sso_status='active' AND NOT e.excluded) AS fixed_count
      FROM groups WHERE active ORDER BY sort_order, name`)) {
    if (!req.auth.canAny(PAY_ROLES, gctx(g.id))) continue;
    const run = await one('SELECT id, status, stale, calculated_at, signed_at FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [g.id, year, month]);
    const tot = run ? await one('SELECT COALESCE(sum(net),0) AS t, count(*)::int AS n FROM payroll_lines WHERE run_id=$1', [run.id]) : null;
    out.push({ ...g, run, runLabel: run ? RUN_LABEL[run.status] : 'Chưa tính', sheets: sheetOut(relevant(await groupSheets(pool, g.id, year, month))), total_net: tot?.t || 0, line_count: tot?.n || 0 });
  }
  return { groups: out };
}));

const { posTitle } = require('../lib/names');
const titleSettings = async () => Object.fromEntries((await rows("SELECT key, value FROM settings WHERE key IN ('plant_title_head','plant_title_deputy')")).map(r => [r.key, r.value]));
router.get('/:groupId/:year/:month', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  if (!req.auth.canAny(PAY_ROLES, gctx(groupId))) bad('Bạn không được phân quyền xem bảng lương này', 403);
  const group = await one('SELECT id, name, kind, pay_type, tax_threshold FROM groups WHERE id=$1', [groupId]);
  if (!group) bad('Không tìm thấy bảng lương', 404);
  const fixed = group.pay_type === 'fixed';
  const run = await one('SELECT * FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]);
  const lines = run ? await rows(`SELECT pl.*, e.full_name, e.employee_code, e.positions, e.title, e.title_manual, e.is_lead, e.shift_no, e.employee_type, v.pay_department_name AS department_name
      FROM payroll_lines pl JOIN employees e ON e.id=pl.employee_id LEFT JOIN v_employees v ON v.id=e.id WHERE pl.run_id=$1
      ORDER BY v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, e.sort_order, e.full_name`, [run.id]) : [];
  const stT = await titleSettings(); lines.forEach(l => { l.positions = posTitle(l, group.kind, stT); });
  const sheets = relevant(await groupSheets(pool, groupId, year, month));
  const allIn = list => (fixed || sheets.length > 0) && sheets.every(s => list.includes(s.status));   // bảng lương khoán không có bảng chấm công
  const allReceived = allIn(['pending_l2', 'pending_l3']);
  const allL2 = allIn(['pending_l2']), allL3 = allIn(['pending_l3']), allDir = allIn(['pending_dir']);
  const ctx = gctx(groupId), st = run?.status || 'none', actions = [];
  // Cấp 2: chạy lương nháp ngay khi cấp 1 trình lên; sửa công/hệ số/thưởng-trừ rồi chốt trình cấp 3
  if ((st === 'none' || st === 'draft') && req.auth.can('l2', ctx)) actions.push({ key: 'calculate', label: run ? 'Tính lại lương nháp' : 'Chạy lương nháp', enabled: fixed || sheets.length > 0, hint: fixed ? '' : 'Lương nháp tự cập nhật mỗi khi có thay đổi chấm công; bấm để tính lại thủ công' });
  if (st === 'draft' && req.auth.can('l2', ctx)) actions.push({ key: 'submit', label: 'Cấp 2 chốt, trình cấp 3', enabled: allL2 && !run.stale, hint: !allL2 ? 'Các bảng chấm công phải đang ở bước "Cấp 2 xử lý"' : run.stale ? 'Dữ liệu đã thay đổi, hãy tính lại trước' : '' });
  // Cấp 3: được sửa công, tính lại, rồi chốt trình Giám đốc hoặc trả lại cấp 2
  if (st === 'submitted' && req.auth.can('l3', ctx)) {
    actions.push({ key: 'calculate', label: 'Tính lại lương', enabled: allL3, hint: allL3 ? '' : 'Các bảng chấm công phải đang ở bước "Cấp 3 kiểm soát"' });
    actions.push({ key: 'l3submit', label: 'Cấp 3 chốt, trình Giám đốc', enabled: allL3 && !run.stale, hint: run.stale ? 'Dữ liệu đã thay đổi, hãy tính lại trước' : '' });
    actions.push({ key: 'return', label: 'Trả lại cấp 2', enabled: true, needNote: true });
  }
  // Giám đốc: khoá & ký (không ai sửa được nữa) hoặc trả lại cấp 3
  if (st === 'pending_dir' && req.auth.can('director', ctx)) {
    actions.push({ key: 'complete', label: 'Giám đốc khoá & ký', enabled: allDir, needConfirm: true });
    actions.push({ key: 'dreturn', label: 'Trả lại cấp 3', enabled: true, needNote: true });
  }
  if (st === 'locked' && !run.signed_at && req.auth.can('director', ctx)) actions.push({ key: 'sign', label: 'Giám đốc ký', enabled: true });
  if (['locked', 'pending_dir', 'submitted'].includes(st) && req.auth.isAdmin) actions.push({ key: 'reopen', label: 'Mở khoá / đưa về cấp 2 (Admin)', enabled: true, needNote: true });
  const ids = run ? [run.calculated_by, run.submitted_by, run.locked_by, run.signed_by].filter(Boolean) : [];
  const names = ids.length ? await rows('SELECT sso_user_id, full_name FROM employees WHERE sso_user_id = ANY($1::text[])', [ids]) : [];
  // Bảng lương khoán: danh sách mọi người thuộc bảng (kể cả người tháng này không chi) để nhập số tiền riêng của tháng
  const fixedEdit = fixed && (st === 'none' || st === 'draft' ? req.auth.can('l2', ctx) : st === 'submitted' && req.auth.can('l3', ctx));
  const members = fixed ? (await fixedMembers(pool, groupId, year, month)).map(m => ({ id: m.id, full_name: m.full_name, fixed_amount: m.fixed_amount, fixed_tax_pct: m.fixed_tax_pct, month_amount: m.month_amount, month_note: m.month_note })) : undefined;
  // Thuế TNCN: cách xử lý (chỉ ước tính / trừ vào thưởng) và biểu thuế của năm — cho tab "Lương + thuế TNCN"
  const pit = fixed ? null : { withhold: (await one(`SELECT value FROM settings WHERE key='pit_withhold'`))?.value || 'none', schedule: await require('../services/pit').scheduleFor(pool, year), settleMonth: 12 };
  return { group, year, month, run, runLabel: run ? RUN_LABEL[run.status] : 'Chưa tính', lines, actions, sheets: sheetOut(sheets), members, fixedEdit, pit,
    coefTypes: await rows('SELECT code, name, kind, is_total FROM coefficient_types WHERE active ORDER BY sort_order, code'), names: Object.fromEntries(names.map(n => [n.sso_user_id, n.full_name])) };
}));

router.post('/:groupId/:year/:month/calculate', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  { const cur = await one('SELECT status FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]);
    if (cur && !['draft', 'submitted'].includes(cur.status)) bad('Bảng lương đã trình Giám đốc hoặc đã khoá, không tính lại được', 409);
    if (cur?.status === 'submitted') req.auth.need('l3', gctx(groupId), 'Bảng đang ở cấp 3, chỉ cấp 3 mới tính lại được'); else req.auth.need('l2', gctx(groupId), 'Chỉ cấp 2 mới được chạy lương nháp'); }
  const sd = req.body?.standardDays;
  if (sd !== undefined && sd !== '' && !(Number(sd) > 0 && Number(sd) <= 31)) bad('Công chuẩn phải từ 1 đến 31');
  const r = await tx(c => calculateRun(c, { groupId, year, month, standardDays: sd === undefined ? undefined : sd === '' || sd === null ? null : sd, userId: req.auth.user.id }));
  await audit(req, 'payroll.calculate', 'payroll_run', r.run.id, { year, month, lines: r.count });
  return { ok: true, count: r.count, warnings: r.warnings };
}));

async function lockedRun(c, groupId, year, month) {
  const run = (await q(c, 'SELECT * FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3 FOR UPDATE', [groupId, year, month]))[0];
  if (!run) bad('Chưa có bảng lương nháp cho tháng này', 404);
  return run;
}
// Chuyển trạng thái toàn bộ bảng chấm công của nhóm trong tháng + ghi lịch sử
async function setPeriods(c, groupId, year, month, from, to, uid, tag, finalize = false) {
  const ps = await q(c, `SELECT p.id FROM periods p JOIN sheets s ON s.id=p.sheet_id WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3 AND p.status=$4`, [groupId, year, month, from]);
  for (const p of ps) {
    if (finalize) await c.query('UPDATE periods SET status=$2, updated_at=now(), final_by=$3, final_at=now() WHERE id=$1', [p.id, to, uid]);
    else await c.query('UPDATE periods SET status=$2, updated_at=now() WHERE id=$1', [p.id, to]);
    await c.query(`INSERT INTO attendance_changes(period_id, field, old_value, new_value, stage, changed_by) VALUES($1,'status',$2,$3,$4,$5)`, [p.id, from, to, tag, uid]);
  }
  return ps.length;
}

const stageErr = 'Có bảng chấm công chưa ở đúng bước (xem trạng thái từng bảng ở đầu trang)';
// Cấp 2 chốt -> trình cấp 3 (cấp 2 hết quyền sửa)
router.post('/:groupId/:year/:month/submit', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  req.auth.need('l2', gctx(groupId), 'Chỉ cấp 2 mới được chốt, trình cấp 3');
  const uid = req.auth.user.id;
  const id = await tx(async c => {
    const run = await lockedRun(c, groupId, year, month);
    if (run.status !== 'draft') bad('Bảng lương không ở bước cấp 2', 409);
    if (run.stale) bad('Dữ liệu đã thay đổi sau lần tính gần nhất. Hãy bấm "Tính lại" rồi mới trình.', 409);
    const sheets = relevant(await groupSheets(c, groupId, year, month));
    const wrong = sheets.filter(s => s.status !== 'pending_l2');
    const fixed = (await q(c, 'SELECT pay_type FROM groups WHERE id=$1', [groupId]))[0]?.pay_type === 'fixed';
    if ((!sheets.length && !fixed) || wrong.length) bad('Chưa thể trình: ' + wrong.map(s => `${s.name} (${STATUS_LABEL[s.status] || 'chưa tạo'})`).join('; '), 409);
    await setPeriods(c, groupId, year, month, 'pending_l2', 'pending_l3', uid, 'send_final');
    await c.query(`UPDATE payroll_runs SET status='submitted', submitted_by=$2, submitted_at=now(), note=NULL WHERE id=$1`, [run.id, uid]);
    return run.id;
  });
  await audit(req, 'payroll.submit', 'payroll_run', id, { year, month });
  return { ok: true };
}));
// Cấp 3 trả lại cấp 2
router.post('/:groupId/:year/:month/return', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req); const note = str(req.body?.note);
  req.auth.need('l3', gctx(groupId), 'Chỉ cấp 3 mới được trả lại cấp 2');
  if (!note) bad('Vui lòng nhập lý do trả lại');
  const uid = req.auth.user.id;
  const id = await tx(async c => {
    const run = await lockedRun(c, groupId, year, month);
    if (run.status !== 'submitted') bad('Bảng lương không ở bước cấp 3', 409);
    await setPeriods(c, groupId, year, month, 'pending_l3', 'pending_l2', uid, 'l3_return');
    await c.query(`UPDATE payroll_runs SET status='draft', note=$2 WHERE id=$1`, [run.id, note]);
    return run.id;
  });
  await audit(req, 'payroll.return', 'payroll_run', id, { year, month, note });
  return { ok: true };
}));
// Cấp 3 chốt -> trình Giám đốc (cấp 3 hết quyền sửa)
router.post('/:groupId/:year/:month/l3submit', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  req.auth.need('l3', gctx(groupId), 'Chỉ cấp 3 mới được chốt, trình Giám đốc');
  const uid = req.auth.user.id;
  const id = await tx(async c => {
    const run = await lockedRun(c, groupId, year, month);
    if (run.status !== 'submitted') bad('Bảng lương không ở bước cấp 3', 409);
    if (run.stale) bad('Dữ liệu đã thay đổi sau lần tính gần nhất. Hãy bấm "Tính lại" rồi mới trình.', 409);
    if (relevant(await groupSheets(c, groupId, year, month)).some(s => s.status !== 'pending_l3')) bad(stageErr, 409);
    await setPeriods(c, groupId, year, month, 'pending_l3', 'pending_dir', uid, 'l3_submit');
    await c.query(`UPDATE payroll_runs SET status='pending_dir', note=NULL WHERE id=$1`, [run.id]);
    return run.id;
  });
  await audit(req, 'payroll.l3submit', 'payroll_run', id, { year, month });
  return { ok: true };
}));
// Giám đốc trả lại cấp 3
router.post('/:groupId/:year/:month/dreturn', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req); const note = str(req.body?.note);
  req.auth.need('director', gctx(groupId), 'Chỉ Giám đốc mới được trả lại cấp 3');
  if (!note) bad('Vui lòng nhập lý do trả lại');
  const uid = req.auth.user.id;
  const id = await tx(async c => {
    const run = await lockedRun(c, groupId, year, month);
    if (run.status !== 'pending_dir') bad('Bảng lương không ở bước chờ Giám đốc', 409);
    await setPeriods(c, groupId, year, month, 'pending_dir', 'pending_l3', uid, 'dir_return');
    await c.query(`UPDATE payroll_runs SET status='submitted', note=$2 WHERE id=$1`, [run.id, note]);
    return run.id;
  });
  await audit(req, 'payroll.dreturn', 'payroll_run', id, { year, month, note });
  return { ok: true };
}));
// Giám đốc khoá & ký -> khoá bảng lương + toàn bộ bảng chấm công liên quan; không ai sửa được nữa (trừ Admin mở khoá)
router.post('/:groupId/:year/:month/complete', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  req.auth.need('director', gctx(groupId), 'Chỉ Giám đốc mới được khoá bảng lương');
  const uid = req.auth.user.id;
  const id = await tx(async c => {
    const run = await lockedRun(c, groupId, year, month);
    if (run.status !== 'pending_dir') bad('Bảng lương chưa được cấp 3 trình Giám đốc', 409);
    if (relevant(await groupSheets(c, groupId, year, month)).some(s => s.status !== 'pending_dir')) bad(stageErr, 409);
    await setPeriods(c, groupId, year, month, 'pending_dir', 'locked', uid, 'complete', true);
    await c.query(`UPDATE payroll_runs SET status='locked', locked_by=$2, locked_at=now(), signed_by=$2, signed_at=now() WHERE id=$1`, [run.id, uid]);
    return run.id;
  });
  await audit(req, 'payroll.complete', 'payroll_run', id, { year, month });
  return { ok: true };
}));
router.post('/:groupId/:year/:month/sign', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  req.auth.need('director', gctx(groupId), 'Chỉ Giám đốc mới được ký');
  const r = await one(`UPDATE payroll_runs SET signed_by=$4, signed_at=now() WHERE group_id=$1 AND year=$2 AND month=$3 AND status='locked' AND signed_at IS NULL RETURNING id`, [groupId, year, month, req.auth.user.id]);
  if (!r) bad('Bảng lương chưa khoá hoặc đã được ký', 409);
  await audit(req, 'payroll.sign', 'payroll_run', r.id, { year, month });
  return { ok: true };
}));
// Admin mở khoá / kéo về cấp 2: lương -> nháp, chấm công -> cấp 2 xử lý. Bắt buộc lý do; ghi lịch sử chấm công + nhật ký.
router.post('/:groupId/:year/:month/reopen', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req); const note = str(req.body?.note);
  req.auth.needAdmin(); if (!note) bad('Vui lòng nhập lý do mở khoá');
  const uid = req.auth.user.id;
  const id = await tx(async c => {
    const run = await lockedRun(c, groupId, year, month);
    if (!['locked', 'pending_dir', 'submitted'].includes(run.status)) bad('Bảng lương đang ở bước cấp 2, không cần mở khoá', 409);
    for (const from of ['locked', 'pending_dir', 'pending_l3']) await setPeriods(c, groupId, year, month, from, 'pending_l2', uid, 'reopen');
    await c.query(`UPDATE payroll_runs SET status='draft', stale=true, signed_by=NULL, signed_at=NULL, locked_by=NULL, locked_at=NULL, note=$2 WHERE id=$1`, [run.id, note]);
    await c.query(`INSERT INTO attendance_changes(period_id, field, old_value, new_value, stage, changed_by) SELECT p.id, 'status', 'reopen', $5, 'reopen', $4 FROM periods p JOIN sheets s ON s.id=p.sheet_id WHERE s.group_id=$1 AND p.year=$2 AND p.month=$3`, [groupId, year, month, uid, 'Mở khoá — ' + note]);
    return run.id;
  });
  await audit(req, 'payroll.reopen', 'payroll_run', id, { year, month, note });
  return { ok: true };
}));

// Bảng lương khoán: nhập số tiền riêng của tháng cho từng người (trống = dùng số tiền mặc định ở Nhân sự; 0 = tháng này không chi), rồi tính lại ngay
router.put('/:groupId/:year/:month/fixed-amounts', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  const list = Array.isArray(req.body?.items) ? req.body.items : bad('Không có dữ liệu');
  const r = await tx(async c => {
    const g = (await q(c, 'SELECT pay_type FROM groups WHERE id=$1', [groupId]))[0];
    if (!g) bad('Không tìm thấy bảng lương', 404);
    if (g.pay_type !== 'fixed') bad('Chỉ bảng lương khoán mới nhập số tiền theo tháng');
    const cur = (await q(c, 'SELECT status FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3 FOR UPDATE', [groupId, year, month]))[0];
    if (cur && !['draft', 'submitted'].includes(cur.status)) bad('Bảng lương đã trình Giám đốc hoặc đã khoá, không sửa được', 409);
    if (cur?.status === 'submitted') req.auth.need('l3', gctx(groupId), 'Bảng đang ở cấp 3, chỉ cấp 3 mới sửa được'); else req.auth.need('l2', gctx(groupId), 'Chỉ cấp 2 mới được nhập số tiền');
    const ids = new Set((await fixedMembers(c, groupId, year, month)).map(m => m.id));
    for (const it of list) {
      if (!isUuid(it.employeeId) || !ids.has(it.employeeId)) bad('Có người không thuộc bảng lương khoán này');
      if (it.amount === '' || it.amount === null || it.amount === undefined) { await c.query('DELETE FROM fixed_pay_months WHERE employee_id=$1 AND year=$2 AND month=$3', [it.employeeId, year, month]); continue; }
      const a = Number(it.amount); if (!Number.isFinite(a) || a < 0 || a > 1e11) bad('Số tiền không hợp lệ');
      await c.query(`INSERT INTO fixed_pay_months(employee_id, year, month, amount, note, updated_by) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (employee_id, year, month) DO UPDATE SET amount=EXCLUDED.amount, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by, updated_at=now()`, [it.employeeId, year, month, Math.round(a), str(it.note).slice(0, 200) || null, req.auth.user.id]);
    }
    return calculateRun(c, { groupId, year, month, userId: req.auth.user.id });
  });
  await audit(req, 'payroll.fixed_amounts', 'payroll_run', r.run.id, { year, month, items: list });
  return { ok: true, count: r.count };
}));

const csvCell = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
router.get('/:groupId/:year/:month/export', async (req, res) => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  if (!req.auth.canAny(PAY_ROLES, gctx(groupId))) bad('Bạn không được phân quyền xem bảng lương này', 403);
  const run = await one('SELECT id FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [groupId, year, month]);
  if (!run) bad('Chưa có bảng lương', 404);
  const lines = await rows(`SELECT pl.*, e.full_name, e.employee_code, v.pay_department_name AS department_name FROM payroll_lines pl JOIN employees e ON e.id=pl.employee_id LEFT JOIN v_employees v ON v.id=e.id
    WHERE pl.run_id=$1 ORDER BY v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, e.sort_order, e.full_name`, [run.id]);
  const head = ['STT', 'Mã NV', 'Họ tên', 'Phòng/đơn vị', 'Ngày công', 'Lương bảo hiểm', 'Thưởng', 'Phụ cấp', 'Tiền ăn', 'Khoản trừ', 'Thực lĩnh'];
  const body = lines.map((l, i) => [i + 1, l.employee_code, l.full_name, l.department_name, l.work_days, l.insurance_salary, l.bonus, l.allowance, l.meal_amount, l.deduction, l.net]);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bang-luong-${year}-${String(month).padStart(2, '0')}.csv"` });
  res.send('﻿' + [head, ...body].map(r => r.map(csvCell).join(',')).join('\r\n'));
});
// Xuất Excel theo bảng lương (nhóm): luong | thuong | he-so | an-ca | khoan | pit (thuế TNCN tạm tính / quyết toán tháng 12)
router.get('/:groupId/:year/:month/export/:what', async (req, res) => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  if (!req.auth.canAny(PAY_ROLES, gctx(groupId))) bad('Bạn không được phân quyền xem bảng lương này', 403);
  const fn = { luong: X.salaryXlsx, thuong: X.bonusXlsx, 'he-so': X.coefXlsx, 'an-ca': X.mealXlsx, khoan: X.fixedXlsx, pit: X.pitXlsx }[req.params.what];
  if (!fn) bad('Loại bảng không hợp lệ', 404);
  const g = await one('SELECT name FROM groups WHERE id=$1', [groupId]); if (!g) bad('Không tìm thấy bảng lương', 404);
  const buf = await fn(pool, groupId, year, month);
  await audit(req, 'export.' + req.params.what, 'group', groupId, { year, month });
  sendXlsx(res, buf, `${{ luong: 'bang-luong', thuong: 'bang-thuong', 'he-so': 'bang-he-so', 'an-ca': 'tien-an-ca', khoan: 'bang-luong-khoan', pit: month === 12 ? 'quyet-toan-thue-tncn' : 'thue-tncn' }[req.params.what]}-${slug(g.name)}-${year}-${pad2(month)}.xlsx`);
});
router.get('/meals/:groupId/:year/:month', api(async req => {
  const groupId = groupParam(req); const { year, month } = ym(req);
  if (!req.auth.canAny(PAY_ROLES, gctx(groupId))) bad('Bạn không được phân quyền xem bảng ăn ca này', 403);
  return mealReport(pool, groupId, year, month);
}));

// ===== Hệ số (có lịch sử, chỉ thêm) =====
const coefRouter = require('express').Router();
async function gradeOf(body) {   // {gradeKey:'Thang|3'} hoặc rỗng -> {scale, grade} đã kiểm tra
  const k = str(body?.grade); if (!k) return { scale: null, grade: null };
  const i = k.lastIndexOf('|'), scale = k.slice(0, i), grade = Math.trunc(Number(k.slice(i + 1)));
  if (i < 0 || !(await one('SELECT 1 FROM salary_grades WHERE scale=$1 AND grade=$2', [scale, grade]))) bad('Bậc lương không có trong thang bậc (Thống kê năm › Bậc lương & đến hạn)');
  return { scale, grade };
}
const stable = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, Number(o[k]) || 0]).filter(x => x[1] !== 0));
coefRouter.get('/', api(async req => {
  const n = nowVN(), today0 = `${n.year}-${String(n.month).padStart(2, '0')}-${String(n.day).padStart(2, '0')}`;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.asOf || '')) ? req.query.asOf : today0;   // xem hệ số có hiệu lực tại ngày bất kỳ
  // Thứ tự như bảng lương: bảng lương (theo thứ tự cấu hình) → HĐQT, BKS, BGĐ rồi các phòng → người
  const emps = await rows(`SELECT v.id, v.full_name, v.employee_code, v.positions, v.title, v.title_manual, v.is_lead, v.shift_no, v.employee_type, v.pay_department_name AS department_name, v.sheet_id, v.group_id, v.group_name, v.group_kind
    FROM v_employees v LEFT JOIN groups g ON g.id=v.group_id WHERE v.sso_status='active' AND v.payroll_active AND v.group_id IS NOT NULL
    ORDER BY g.sort_order, v.group_name, v.pay_department_sort NULLS LAST, v.pay_department_name, v.emp_order, v.sort_order, v.full_name`);
  const cm = new Map((await rows(`SELECT DISTINCT ON (employee_id) id, employee_id, vals, effective_from FROM coefficient_history WHERE effective_from <= $1 ORDER BY employee_id, effective_from DESC, id DESC`, [today])).map(c => [c.employee_id, c]));
  const stT = await titleSettings();
  const gs = await G.states(today, emps.map(e => e.id));
  return { employees: emps.filter(e => req.auth.canAny(PAY_ROLES, { groupId: e.group_id, sheetId: e.sheet_id })).map(e => ({ ...e, grade: gs.get(e.id) || null, positions: posTitle(e, e.group_kind, stT), history_id: cm.get(e.id)?.id || null, vals: cm.get(e.id)?.vals || {}, effective_from: cm.get(e.id)?.effective_from || null, editable: req.auth.can('hr', { groupId: e.group_id, sheetId: e.sheet_id }) })),
    coefTypes: await rows('SELECT code, name, kind, is_total FROM coefficient_types WHERE active ORDER BY sort_order, code'), grades: await rows('SELECT scale, grade, coefficient, months_to_next FROM salary_grades ORDER BY scale, grade'), gradeCoef: (await G.coefCode()).code, asOf: today, today: today0 };
}));
coefRouter.delete('/history/:id', api(async req => {
  const id = Number(req.params.id); if (!Number.isInteger(id)) bad('Mã không hợp lệ');
  await tx(async c => {
    const h = (await q(c, 'SELECT h.id, h.employee_id, h.effective_from, h.vals, e.group_id, e.sheet_id FROM coefficient_history h JOIN v_employees e ON e.id=h.employee_id WHERE h.id=$1', [id]))[0];
    if (!h) bad('Không tìm thấy bản ghi', 404);
    req.auth.need('hr', { groupId: h.group_id, sheetId: h.sheet_id }, 'Bạn không có quyền xoá hệ số của nhân sự này');
    await c.query('DELETE FROM coefficient_history WHERE id=$1', [id]);
    if (h.group_id) await markStale(c, h.group_id);
    await audit(req, 'coefficient.delete', 'coefficient_history', String(id), { employeeId: h.employee_id, effectiveFrom: h.effective_from, vals: h.vals });
  });
  return { ok: true };
}));
// Sửa trực tiếp một bản ghi hệ số (sửa sai) — khác với "cập nhật hệ số mới" (tạo bản ghi mới theo ngày hiệu lực)
// Hệ số "tổng" (vd Hệ số thưởng) = cộng các hệ số thưởng thành phần; chưa nhập thành phần nào thì giữ giá trị tổng nhập tay
function fixTotal(vals, typeRows) {
  const tot = typeRows.filter(t => t.kind === 'bonus' && t.is_total); if (!tot.length) return;
  const comp = typeRows.filter(t => t.kind === 'bonus' && !t.is_total).reduce((sum, t) => sum + (Number(vals[t.code]) || 0), 0);
  if (comp > 0) for (const t of tot) vals[t.code] = Math.round(comp * 1e6) / 1e6;
}
coefRouter.patch('/history/:id', api(async req => {
  const id = Number(req.params.id); if (!Number.isInteger(id)) bad('Mã không hợp lệ');
  const typeRows = await rows('SELECT code, kind, is_total FROM coefficient_types'), types = new Set(typeRows.map(t => t.code));
  await tx(async c => {
    const h = (await q(c, 'SELECT h.id, h.employee_id, h.effective_from, h.vals, h.note, e.group_id, e.sheet_id FROM coefficient_history h JOIN v_employees e ON e.id=h.employee_id WHERE h.id=$1 FOR UPDATE OF h', [id]))[0];
    if (!h) bad('Không tìm thấy bản ghi', 404);
    req.auth.need('hr', { groupId: h.group_id, sheetId: h.sheet_id }, 'Bạn không có quyền sửa hệ số của nhân sự này');
    const vals = {};
    for (const [k, v] of Object.entries(req.body?.vals || {})) {
      if (!types.has(k)) bad(`Loại hệ số "${k}" không tồn tại`);
      const n = Number(v === '' || v === null ? 0 : v); if (!Number.isFinite(n) || n < 0) bad('Hệ số phải là số không âm');
      vals[k] = n;
    }
    fixTotal(vals, typeRows);
    const eff = req.body?.effectiveFrom ? String(req.body.effectiveFrom) : null;
    if (eff && !/^\d{4}-\d{2}-\d{2}$/.test(eff)) bad('Ngày hiệu lực không hợp lệ');
    const gr = 'grade' in (req.body || {}) ? await gradeOf(req.body) : null;
    await c.query('UPDATE coefficient_history SET vals=$2, effective_from=COALESCE($3, effective_from), note=$4, grade_scale=CASE WHEN $5 THEN $6 ELSE grade_scale END, grade=CASE WHEN $5 THEN $7 ELSE grade END WHERE id=$1',
      [id, JSON.stringify(vals), eff, 'note' in (req.body || {}) ? (str(req.body.note) || null) : h.note, !!gr, gr?.scale ?? null, gr?.grade ?? null]);
    if (h.group_id) await markStale(c, h.group_id);
    await audit(req, 'coefficient.edit', 'coefficient_history', String(id), { employeeId: h.employee_id, before: { effectiveFrom: h.effective_from, vals: h.vals }, after: { effectiveFrom: eff || h.effective_from, vals, grade: req.body?.grade } });
  });
  return { ok: true };
}));
coefRouter.get('/:employeeId/history', api(async req => {
  if (!isUuid(req.params.employeeId)) bad('Mã không hợp lệ');
  const e = await one('SELECT id, full_name, group_id, sheet_id FROM v_employees WHERE id=$1', [req.params.employeeId]);
  if (!e) bad('Không tìm thấy nhân sự', 404);
  if (!req.auth.canAny(PAY_ROLES, { groupId: e.group_id, sheetId: e.sheet_id })) bad('Bạn không có quyền xem', 403);
  return { employee: e, canDelete: req.auth.can('hr', { groupId: e.group_id, sheetId: e.sheet_id }), items: await rows(`SELECT h.id, h.effective_from, h.vals, h.note, h.grade_scale, h.grade, h.created_at, u.full_name AS created_by_name FROM coefficient_history h
    LEFT JOIN employees u ON u.sso_user_id=h.created_by WHERE h.employee_id=$1 ORDER BY h.effective_from DESC, h.id DESC`, [e.id]) };
}));
coefRouter.post('/bulk', api(async req => {
  const eff = req.body?.effectiveFrom; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(eff || ''))) bad('Chọn ngày hiệu lực');
  const list = Array.isArray(req.body?.rows) ? req.body.rows : bad('Không có dữ liệu');
  const typeRows = await rows('SELECT code, kind, is_total FROM coefficient_types'), types = new Set(typeRows.map(t => t.code));
  let saved = 0; const groups = new Set();
  await tx(async c => {
    for (const r of list) {
      if (!isUuid(r.employeeId)) bad('Mã nhân sự không hợp lệ');
      const e = (await q(c, 'SELECT id, group_id, sheet_id FROM v_employees WHERE id=$1', [r.employeeId]))[0];
      if (!e) bad('Không tìm thấy nhân sự', 404);
      req.auth.need('hr', { groupId: e.group_id, sheetId: e.sheet_id }, 'Bạn không có quyền sửa hệ số của nhân sự này');
      const vals = {};
      for (const [k, v] of Object.entries(r.vals || {})) {
        if (!types.has(k)) bad(`Loại hệ số "${k}" không tồn tại`);
        const n = Number(v === '' ? 0 : v); if (!Number.isFinite(n) || n < 0) bad('Hệ số phải là số không âm');
        vals[k] = n;
      }
      fixTotal(vals, typeRows);
      const last = (await q(c, `SELECT vals, grade_scale, grade FROM coefficient_history WHERE employee_id=$1 AND effective_from <= $2 ORDER BY effective_from DESC, id DESC LIMIT 1`, [r.employeeId, eff]))[0];
      const gr = 'grade' in r ? await gradeOf(r) : { scale: last?.grade_scale || null, grade: last?.grade || null };   // không gửi 'grade' = giữ bậc hiện tại
      if (last && stable(last.vals) === stable(vals) && (last.grade || null) === gr.grade && (last.grade_scale || null) === gr.scale) continue;
      await c.query('INSERT INTO coefficient_history(employee_id, effective_from, vals, note, grade_scale, grade, created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [r.employeeId, eff, JSON.stringify(vals), str(req.body?.note) || null, gr.scale, gr.grade, req.auth.user.id]);
      saved++; if (e.group_id) groups.add(e.group_id);
    }
    for (const g of groups) await markStale(c, g);
  });
  await audit(req, 'coefficient.save', 'coefficient_history', null, { effectiveFrom: eff, saved });
  return { ok: true, saved };
}));

// ===== Thưởng / khoản trừ theo tháng =====
const itemRouter = require('express').Router();
itemRouter.get('/roster', api(async req => {
  const groupId = req.query.groupId; if (!isUuid(groupId)) bad('Chọn bảng lương');
  if (!req.auth.canAny(PAY_ROLES, gctx(groupId))) bad('Bạn không có quyền xem', 403);
  return { employees: await rows(`SELECT id, full_name, pay_department_name AS department_name FROM v_employees WHERE group_id=$1 AND sso_status='active' AND payroll_active AND pay_mode<>'fixed' ORDER BY pay_department_sort NULLS LAST, pay_department_name, emp_order, sort_order, full_name`, [groupId]) };
}));
itemRouter.get('/', api(async req => {
  const { year, month } = ym(req); const groupId = req.query.groupId;
  if (!isUuid(groupId)) bad('Chọn bảng lương');
  if (!req.auth.canAny(PAY_ROLES, gctx(groupId))) bad('Bạn không có quyền xem', 403);
  return { items: await rows(`SELECT i.id, i.employee_id, i.kind, i.label, i.amount, i.calc, i.basis, i.value, i.created_at, e.full_name, e.pay_department_name AS department_name FROM monthly_items i JOIN v_employees e ON e.id=i.employee_id
    WHERE i.year=$1 AND i.month=$2 AND e.group_id=$3 ORDER BY i.kind, i.label, e.pay_department_sort NULLS LAST, e.full_name, i.created_at`, [year, month, groupId]) };
}));
async function assertItemEditable(c, req, employeeId, year, month) {
  const e = (await q(c, 'SELECT id, group_id, sheet_id FROM v_employees WHERE id=$1', [employeeId]))[0];
  if (!e || !e.group_id) bad('Nhân sự chưa thuộc bảng lương nào', 400);
  const ctx = { groupId: e.group_id, sheetId: e.sheet_id };
  const run = (await q(c, 'SELECT status FROM payroll_runs WHERE group_id=$1 AND year=$2 AND month=$3', [e.group_id, year, month]))[0];
  if (run && !['draft', 'submitted'].includes(run.status)) bad('Bảng lương tháng này đã trình Giám đốc/khoá, không thể thêm hoặc xoá khoản thưởng/trừ', 409);
  if (run?.status === 'submitted') { if (!req.auth.can('l3', ctx)) bad('Bảng đang ở cấp 3: chỉ cấp 3 mới được sửa thưởng/trừ', 403); }
  else if (!req.auth.can('hr', ctx) && !req.auth.can('l2', ctx)) bad('Chỉ cấp 2 hoặc người quản lý thưởng/trừ mới được sửa', 403);
  return e;
}
// Thêm khoản thưởng/trừ cho 1 hoặc NHIỀU người cùng lúc.
//  kind: bonus (thưởng thêm → bảng thưởng) | deduction (trừ vào lương → bảng lương) | bonus_deduction (trừ vào thưởng, vd thuế TNCN → bảng thưởng)
//  calc: fixed (mọi người cùng 1 số tiền) | coef_price (hệ số của từng người × đơn giá; basis = insurance | bonus)
itemRouter.post('/', api(async req => {
  const b = req.body || {}, year = Number(b.year), month = Number(b.month);
  const ids = [...new Set(Array.isArray(b.employeeIds) ? b.employeeIds : b.employeeId ? [b.employeeId] : [])];
  if (!validYM(year, month) || !ids.length || ids.some(i => !isUuid(i))) bad('Chọn ít nhất một nhân sự');
  if (!['bonus', 'deduction', 'bonus_deduction'].includes(b.kind)) bad('Loại khoản không hợp lệ');
  if (!str(b.label)) bad('Nhập nội dung khoản');
  const calc = b.calc === 'coef_price' ? 'coef_price' : 'fixed';
  const val = Number(calc === 'fixed' ? (b.amount ?? b.value) : b.value);
  if (!(val >= 0) || val > 1e11) bad(calc === 'fixed' ? 'Số tiền không hợp lệ' : 'Đơn giá không hợp lệ');
  const basis = calc === 'coef_price' ? (['insurance', 'bonus'].includes(b.basis) ? b.basis : bad('Chọn hệ số làm gốc (hệ số bảo hiểm hoặc hệ số thưởng)')) : null;
  const n = await tx(async c => {
    const groups = new Set();
    for (const id of ids) {
      const e = await assertItemEditable(c, req, id, year, month);
      await c.query('INSERT INTO monthly_items(employee_id, year, month, kind, label, calc, basis, value, amount, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [id, year, month, b.kind, str(b.label).slice(0, 200), calc, basis, calc === 'coef_price' ? val : 0, calc === 'fixed' ? val : 0, req.auth.user.id]);
      groups.add(e.group_id);
    }
    for (const g of groups) await markStale(c, g);
    return ids.length;
  });
  await audit(req, 'item.add', 'monthly_items', null, { ...b, count: n }); return { ok: true, count: n };
}));
itemRouter.post('/delete-many', api(async req => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!ids.length) bad('Chưa chọn khoản nào');
  await tx(async c => {
    const its = await q(c, 'SELECT * FROM monthly_items WHERE id = ANY($1::bigint[])', [ids]), groups = new Set();
    for (const it of its) { const e = await assertItemEditable(c, req, it.employee_id, it.year, it.month); groups.add(e.group_id); await c.query('DELETE FROM monthly_items WHERE id=$1', [it.id]); }
    for (const g of groups) await markStale(c, g);
  });
  await audit(req, 'item.delete_many', 'monthly_items', null, { ids }); return { ok: true };
}));
itemRouter.delete('/:id', api(async req => {
  const it = await one('SELECT * FROM monthly_items WHERE id=$1', [Number(req.params.id) || 0]);
  if (!it) bad('Không tìm thấy', 404);
  await tx(async c => { const e = await assertItemEditable(c, req, it.employee_id, it.year, it.month); await c.query('DELETE FROM monthly_items WHERE id=$1', [it.id]); await markStale(c, e.group_id); });
  await audit(req, 'item.delete', 'monthly_items', it.id, it); return { ok: true };
}));
module.exports = { payroll: router, coefficients: coefRouter, items: itemRouter };
