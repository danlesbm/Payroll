const router = require('express').Router();
const { pool, rows, one, tx } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, str, api, forbid } = require('../lib/http');
const { ROLES, SCOPES_OF } = require('../lib/permissions');
const { syncDirectory, normalizeShifts } = require('../sso');
const { isEmpType } = require('../lib/emptypes');
const { posTitle } = require('../lib/names');

// Quản lý nhân sự: Admin hoặc người có quyền "people" (toàn hệ thống)
const needPeople = req => { if (!req.auth.isAdmin && !req.auth.can('people', {})) forbid('Chỉ Admin hoặc người được phân quyền "Quản lý nhân sự" mới thực hiện được'); };
router.get('/employees', api(async req => {
  needPeople(req);
  const { q, groupId, sheetId, departmentId, unassigned, all, everyone } = req.query;
  const p = [], w = [];
  if (!all) w.push(`v.sso_status='active'`);
  if (q) { p.push('%' + str(q).toLowerCase() + '%'); w.push(`(lower(v.full_name) LIKE $${p.length} OR lower(coalesce(v.email,'')) LIKE $${p.length} OR lower(coalesce(v.employee_code,'')) LIKE $${p.length})`); }
  if (isUuid(groupId)) { p.push(groupId); w.push(`v.group_id=$${p.length}`); }
  if (isUuid(sheetId)) { p.push(sheetId); w.push(`v.sheet_id=$${p.length}`); }
  if (isUuid(departmentId)) { p.push(departmentId); w.push(`v.department_id=$${p.length}`); }
  if (unassigned === '1') w.push('v.department_id IS NULL');
  else if (!everyone) w.push('v.department_id IS NOT NULL');   // người chưa thuộc phòng nào: ẩn khỏi màn cấu hình (chỉ dùng everyone=1 khi gán quyền)
  const stT = Object.fromEntries((await rows("SELECT key, value FROM settings WHERE key IN ('plant_title_head','plant_title_deputy')")).map(r => [r.key, r.value]));
  const list = await rows(`SELECT v.id, v.sso_user_id, v.employee_code, v.full_name, v.email, v.positions, v.title, v.title_manual, v.group_kind, v.employee_type, v.weekly_off, v.allowance_group_id, v.shift_no, v.is_lead, v.type_locked, v.pos_rank, v.sso_status, v.payroll_active,
      v.sort_order, v.mapped_department_id, v.override_department_id, v.department_id, v.department_name, v.pay_department_name, v.pay_dept_id, v.sheet_name, v.group_name, v.sso_dept_ids
    FROM v_employees v ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY v.group_name NULLS LAST, v.department_sort NULLS LAST, v.department_name NULLS LAST, v.emp_order, v.sort_order, v.full_name LIMIT 3000`, p);
  // auto_title: chức danh tự động (khi chưa sửa tay) để hiện gợi ý ở ô Chức danh
  // sso_title: chức danh theo SSO (bỏ qua kíp / trưởng ca) — để màn hình đổi gợi ý ngay khi tick trưởng ca / chọn kíp
  return { employees: list.map(e => ({ ...e, auto_title: posTitle({ ...e, title_manual: null }, e.group_kind, stT), sso_title: posTitle({ ...e, title_manual: null, is_lead: false, shift_no: null }, e.group_kind, stT) })) };
}));

// ---- Dùng chung: dựng câu lệnh UPDATE từ các trường được phép; chụp ảnh trạng thái cũ để hoàn tác ----
const SNAP_COLS = ['employee_code', 'employee_type', 'shift_no', 'is_lead', 'allowance_group_id', 'weekly_off', 'payroll_active', 'sort_order', 'override_department_id', 'type_locked', 'title_manual'];
function buildSets(b, p) {
  const sets = [], add = (col, v) => { p.push(v); sets.push(`${col}=$${p.length}`); };
  if ('employee_code' in b) add('employee_code', str(b.employee_code) || null);
  if ('title_manual' in b) add('title_manual', String(b.title_manual ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || null);   // trống = theo chức danh tự động
  if ('employee_type' in b) { if (!isEmpType(b.employee_type)) bad('Loại nhân sự không hợp lệ'); add('employee_type', b.employee_type); }
  if ('shift_no' in b) { const n = b.shift_no === '' || b.shift_no === null ? null : Math.trunc(Number(b.shift_no)); if (n !== null && !(n >= 1 && n <= 20)) bad('Kíp phải từ 1 đến 20'); add('shift_no', n); }
  if ('is_lead' in b) add('is_lead', b.is_lead === true || b.is_lead === 'true');
  if ('allowance_group_id' in b) { if (b.allowance_group_id && !isUuid(b.allowance_group_id)) bad('Nhóm phụ cấp không hợp lệ'); add('allowance_group_id', b.allowance_group_id || null); }
  if ('weekly_off' in b) { if (b.weekly_off !== '' && b.weekly_off !== null && !['sun', 'sat_sun'].includes(b.weekly_off)) bad('Lịch nghỉ hằng tuần không hợp lệ'); add('weekly_off', b.weekly_off || null); }
  if ('payroll_active' in b) add('payroll_active', b.payroll_active === true || b.payroll_active === 'true');
  if ('sort_order' in b) add('sort_order', Math.trunc(Number(b.sort_order) || 0));
  if ('override_department_id' in b) { if (b.override_department_id && !isUuid(b.override_department_id)) bad('Phòng không hợp lệ'); add('override_department_id', b.override_department_id || null); }
  if ('employee_type' in b || 'weekly_off' in b) sets.push('type_locked=true');
  return { sets, stale: 'weekly_off' in b || 'allowance_group_id' in b || 'employee_type' in b || 'payroll_active' in b };
}
async function snapshot(req, label, ids) {
  if (!ids.length) return null;
  const old = await rows(`SELECT id, ${SNAP_COLS.join(', ')} FROM employees WHERE id = ANY($1::uuid[])`, [ids]);
  const r = await one('INSERT INTO employee_snapshots(label, actor_name, rows) VALUES($1,$2,$3) RETURNING id', [label, req.auth?.user?.name || null, JSON.stringify(old)]);
  await pool.query(`DELETE FROM employee_snapshots WHERE id < (SELECT COALESCE(max(id),0) - 30 FROM employee_snapshots)`);
  return r.id;
}

// Lưu nhiều thay đổi cùng lúc (nút "Lưu thay đổi" ở tab Nhân sự): changes = [{ id, ...trường }]
router.post('/employees-batch', api(async req => {
  needPeople(req);
  const ch = Array.isArray(req.body?.changes) ? req.body.changes : [];
  if (!ch.length) bad('Chưa có thay đổi nào');
  if (ch.some(c => !isUuid(c.id))) bad('Mã nhân sự không hợp lệ');
  const prepared = ch.map(c => { const { id, ...f } = c; const p = [id]; const { sets, stale } = buildSets(f, p); if (!sets.length) bad('Không có gì để cập nhật'); return { id, p, sets, stale }; });
  const snap = await snapshot(req, `Lưu thay đổi ${prepared.length} người`, prepared.map(x => x.id));
  await tx(async c => { for (const x of prepared) await c.query(`UPDATE employees SET ${x.sets.join(',')}, updated_at=now() WHERE id=$1`, x.p); });
  if (prepared.some(x => x.stale)) await require('../services/payroll').markStale(pool);
  await normalizeShifts();
  await audit(req, 'employee.batch', 'employee', null, { n: prepared.length, snapshot: snap });
  return { ok: true, updated: prepared.length, snapshotId: snap };
}));

// Gom nhiều người vào cùng một kíp / đổi loại cùng lúc
router.patch('/employees-bulk', api(async req => {
  needPeople(req);
  const b = req.body || {}, ids = Array.isArray(b.ids) ? b.ids : [];
  if (!ids.length || ids.some(i => !isUuid(i))) bad('Chưa chọn người nào');
  const { ids: _x, ...f } = b, p = [ids];
  const { sets, stale } = buildSets(f, p);
  if (!sets.length) bad('Không có gì để cập nhật');
  const snap = await snapshot(req, `Áp dụng hàng loạt cho ${ids.length} người`, ids);
  const r = await pool.query(`UPDATE employees SET ${sets.join(',')}, updated_at=now() WHERE id = ANY($1::uuid[])`, p);
  if (stale) await require('../services/payroll').markStale(pool);
  await normalizeShifts();
  await audit(req, 'employee.bulk', 'employee', null, { n: r.rowCount, ...f, snapshot: snap });
  return { ok: true, updated: r.rowCount, snapshotId: snap };
}));
// Tự nhận loại + lịch nghỉ: Quản lý (nghỉ T7 + CN) = toàn bộ khối văn phòng + Giám đốc / Phó giám đốc nhà máy (Trưởng / Phó phòng ở nhà máy);
// còn lại = Công nhân (nghỉ CN). Người đã được chỉnh tay (type_locked) được GIỮ NGUYÊN, trừ khi chọn ghi đè.
// { dryRun: true } chỉ trả danh sách sẽ thay đổi để người dùng xem trước. Mỗi lần áp dụng đều có ảnh chụp để hoàn tác.
router.post('/employees-autotype', api(async req => {
  needPeople(req);
  const dry = req.body?.dryRun === true, overwrite = req.body?.overwrite === true;
  const T = `(CASE WHEN v.employee_type = 'admin' THEN 'admin' WHEN v.pos_rank <= 40 OR v.group_kind = 'office' THEN 'manager' ELSE 'worker' END)`, O = `(CASE WHEN v.pos_rank <= 40 OR v.group_kind = 'office' THEN 'sat_sun' ELSE 'sun' END)`;
  const all = await rows(`SELECT v.id, v.full_name, v.positions, v.department_name, v.group_name, v.employee_type AS cur_type, v.weekly_off AS cur_off, v.type_locked, ${T} AS new_type, ${O} AS new_off
    FROM v_employees v WHERE v.sso_status='active' AND NOT v.excluded AND v.department_id IS NOT NULL ORDER BY v.group_name NULLS LAST, v.department_sort NULLS LAST, v.emp_order, v.full_name`);
  const diff = all.filter(x => x.cur_type !== x.new_type || x.cur_off !== x.new_off);
  const kept = diff.filter(x => x.type_locked && !overwrite), todo = diff.filter(x => !(x.type_locked && !overwrite));
  if (dry) return { dryRun: true, total: all.length, changes: todo, keptLocked: kept.length, lockedAll: all.filter(x => x.type_locked).length };
  const snap = await snapshot(req, `Tự nhận loại + lịch nghỉ (${todo.length} người)`, todo.map(x => x.id));
  if (todo.length) await pool.query(`UPDATE employees SET employee_type = t.nt, weekly_off = t.nw, type_locked=false, updated_at=now() FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS nt, unnest($3::text[]) AS nw) t WHERE employees.id = t.id`, [todo.map(x => x.id), todo.map(x => x.new_type), todo.map(x => x.new_off)]);
  const cnt = await one(`SELECT count(*) FILTER (WHERE employee_type='manager')::int AS managers, count(*) FILTER (WHERE employee_type='admin')::int AS admins, count(*) FILTER (WHERE employee_type='worker')::int AS workers FROM employees WHERE sso_status='active'`);
  await normalizeShifts();
  await require('../services/payroll').markStale(pool);
  await audit(req, 'employee.autotype', 'employee', null, { n: todo.length, keptLocked: kept.length, overwrite, snapshot: snap, ...cnt });
  return { ok: true, updated: todo.length, keptLocked: kept.length, snapshotId: snap, ...cnt };
}));
router.patch('/employees/:id', api(async req => {
  needPeople(req);
  if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const p = [req.params.id], { sets, stale } = buildSets(req.body || {}, p);
  if (!sets.length) bad('Không có gì để cập nhật');
  if (!(await one(`UPDATE employees SET ${sets.join(',')}, updated_at=now() WHERE id=$1 RETURNING id`, p))) bad('Không tìm thấy nhân sự', 404);
  if (stale) await require('../services/payroll').markStale(pool);
  await normalizeShifts();
  await audit(req, 'employee.update', 'employee', req.params.id, req.body);
  return { ok: true };
}));

// Hoàn tác: danh sách các lần thay đổi gần nhất và khôi phục về trạng thái trước lần đó (kèm cả các lần sau nó nếu có → chỉ cho hoàn tác lần MỚI NHẤT chưa hoàn tác)
router.get('/employees-undo', api(async req => {
  needPeople(req);
  const last = await one(`SELECT id, label, actor_name, created_at, jsonb_array_length(rows)::int AS n FROM employee_snapshots WHERE undone_at IS NULL ORDER BY id DESC LIMIT 1`);
  return { last: last || null };
}));
router.post('/employees-undo', api(async req => {
  needPeople(req);
  const s = await one(`SELECT id, label, rows FROM employee_snapshots WHERE undone_at IS NULL ORDER BY id DESC LIMIT 1`);
  if (!s) bad('Không còn lần thay đổi nào để hoàn tác');
  const list = s.rows;
  await tx(async c => {
    for (const r of list) {
      // ảnh chụp cũ (trước khi có cột title_manual…) không có cột đó: giữ nguyên giá trị hiện tại thay vì xoá
      const p = [r.id], sets = SNAP_COLS.filter(col => col in r).map(col => { p.push(r[col]); return `${col}=$${p.length}`; });
      await c.query(`UPDATE employees SET ${sets.join(',')}, updated_at=now() WHERE id=$1`, p);
    }
    await c.query('UPDATE employee_snapshots SET undone_at=now() WHERE id=$1', [s.id]);
  });
  await require('../services/payroll').markStale(pool);
  await audit(req, 'employee.undo', 'employee', null, { snapshot: s.id, label: s.label, n: list.length });
  return { ok: true, restored: list.length, label: s.label };
}));

router.post('/sso/sync', api(async req => { req.auth.needAdmin(); const r = await syncDirectory(); await audit(req, 'sso.sync', 'sso', null, r); return { ok: true, ...r }; }));
router.get('/sso/status', api(async req => {
  req.auth.needAdmin();
  return one(`SELECT (SELECT max(synced_at) FROM employees) AS last_sync, (SELECT count(*)::int FROM employees WHERE sso_status='active') AS active_users, (SELECT count(*)::int FROM sso_departments_cache) AS sso_departments`);
}));

// Phân quyền: chọn 1 người, TICK NHIỀU quyền, TICK NHIỀU phạm vi -> tạo mọi tổ hợp
router.get('/assignments', api(async req => {
  req.auth.needAdmin();
  const [list, groups, sheets] = await Promise.all([
    rows(`SELECT ra.id, ra.sso_user_id, ra.role, ra.scope_type, ra.scope_id, e.full_name, e.email, e.positions
          FROM role_assignments ra LEFT JOIN employees e ON e.sso_user_id=ra.sso_user_id ORDER BY e.full_name NULLS LAST, ra.role, ra.scope_type`),
    rows('SELECT id, name FROM groups'), rows('SELECT id, name FROM sheets')]);
  const dn = new Map((await rows('SELECT id, name FROM departments')).map(d => [d.id, d.name]));
  const gn = new Map(groups.map(g => [g.id, g.name])), sn = new Map(sheets.map(s => [s.id, s.name]));
  const auto = (await require('../lib/autoroles').forAll()).map(a => ({ ...a, role_label: ROLES[a.role], scope_label: a.scope_type === 'all' ? 'Toàn hệ thống' : `Bảng chấm công: ${a.scope_name}` }));
  return { roles: ROLES, scopesOf: Object.fromEntries(Object.keys(ROLES).map(r => [r, SCOPES_OF(r)])), auto, assignments: list.map(a => ({ ...a, role_label: ROLES[a.role] || a.role,
    scope_label: a.scope_type === 'all' ? 'Toàn hệ thống' : a.scope_type === 'group' ? `Bảng lương: ${gn.get(a.scope_id) || '?'}` : a.scope_type === 'department' ? `Bộ phận: ${dn.get(a.scope_id) || '?'}` : `Bảng chấm công: ${sn.get(a.scope_id) || '?'}` })) };
}));
router.post('/assignments', api(async req => {
  req.auth.needAdmin();
  const userId = str(req.body?.userId);
  const roles = [...new Set(Array.isArray(req.body?.roles) ? req.body.roles : [])];
  let scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : [];
  if (!userId) bad('Chưa chọn người dùng');
  if (roles.some(r => r === 'l1' || r === 'director')) bad('Kiểm soát cấp 1 và Giám đốc tự động theo chức vụ SSO, không gán tay');
  if (!roles.length) bad('Chưa chọn quyền nào');
  for (const r of roles) if (!ROLES[r]) bad(`Quyền "${r}" không tồn tại`);
  if (!(await one('SELECT 1 FROM employees WHERE sso_user_id=$1', [userId]))) bad('Người dùng chưa có trong Payroll. Hãy bấm "Đồng bộ từ SSO" trước.');
  const gset = new Set((await rows('SELECT id FROM groups')).map(g => g.id)), sset = new Set((await rows('SELECT id FROM sheets')).map(s => s.id)), dset = new Set((await rows('SELECT id FROM departments')).map(d => d.id));
  scopes = scopes.map(s => ({ type: str(s.type), id: str(s.id) }));
  if (!roles.every(r => r === 'admin') && !scopes.length) bad('Chưa chọn phạm vi nào (hoặc chọn "Toàn hệ thống")');
  for (const s of scopes) {
    if (s.type === 'all') s.id = '';
    else if (!((s.type === 'group' && gset.has(s.id)) || (s.type === 'sheet' && sset.has(s.id)) || (s.type === 'department' && dset.has(s.id)))) bad('Phạm vi không hợp lệ');
  }
  let added = 0;
  const scopesFor = role => role === 'admin' ? [{ type: 'all', id: '' }] : scopes.filter(s => SCOPES_OF(role).includes(s.type));
  for (const role of roles) if (!scopesFor(role).length) bad(`Quyền "${ROLES[role]}" không dùng được với phạm vi đã chọn (quyền này ${SCOPES_OF(role).includes('all') && SCOPES_OF(role).length === 1 ? 'chỉ áp dụng Toàn hệ thống' : 'cần chọn phạm vi khác'})`);
  await tx(async c => {
    for (const role of roles) for (const s of scopesFor(role)) {
      added += (await c.query(`INSERT INTO role_assignments(sso_user_id, role, scope_type, scope_id, created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [userId, role, s.type, s.id, req.auth.user.id])).rowCount;
    }
  });
  await audit(req, 'assignment.add', 'user', userId, { roles, scopes, added });
  return { ok: true, added };
}));
router.delete('/assignments/user/:userId', api(async req => {
  req.auth.needAdmin();
  const n = (await pool.query('DELETE FROM role_assignments WHERE sso_user_id=$1', [req.params.userId])).rowCount;
  await audit(req, 'assignment.clear_user', 'user', req.params.userId, { removed: n });
  return { ok: true, removed: n };
}));
router.delete('/assignments/:id', api(async req => {
  req.auth.needAdmin();
  if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const r = await one('DELETE FROM role_assignments WHERE id=$1 RETURNING *', [req.params.id]);
  if (!r) bad('Không tìm thấy', 404);
  await audit(req, 'assignment.delete', 'user', r.sso_user_id, r);
  return { ok: true };
}));

router.get('/audit', api(async req => {
  req.auth.needAdmin();
  return { items: await rows('SELECT id, actor_name, action, entity, entity_id, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT $1', [Math.min(500, Number(req.query.limit) || 200)]) };
}));
module.exports = router;
