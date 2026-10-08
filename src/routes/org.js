const router = require('express').Router();
const { rows, one, tx } = require('../db');
const { audit } = require('../auth');
const { bad, isUuid, api } = require('../lib/http');
const { crud } = require('../lib/crud');
const { resolveEmployees } = require('../sso');
const admin = req => req.auth.needAdmin();
const reresolve = async () => { await resolveEmployees(); await require('../services/payroll').markStale(require('../db').pool); };

router.get('/', api(async () => {
  const [groups, sheets, departments, sso, counts, unassigned, total, fixedPeople] = await Promise.all([
    rows('SELECT * FROM groups ORDER BY sort_order, name'),
    rows('SELECT * FROM sheets ORDER BY sort_order, name'),
    rows(`SELECT d.*, COALESCE((SELECT json_agg(m.sso_department_id ORDER BY m.sort_order) FROM department_sso_map m WHERE m.department_id=d.id),'[]'::json) AS sso_ids FROM departments d ORDER BY d.sort_order, d.name`),
    rows(`SELECT c.id, c.name, m.department_id FROM sso_departments_cache c LEFT JOIN department_sso_map m ON m.sso_department_id=c.id ORDER BY c.name`),
    rows(`SELECT department_id, count(*)::int AS n FROM v_employees WHERE sso_status='active' AND payroll_active AND department_id IS NOT NULL GROUP BY department_id`),
    one(`SELECT count(*)::int AS n FROM v_employees WHERE sso_status='active' AND payroll_active AND department_id IS NULL`),
    one(`SELECT count(*)::int AS n FROM employees WHERE sso_status='active'`),
    rows(`SELECT v.id, v.full_name, v.fixed_group_id, v.payroll_active, COALESCE(v.pay_department_name, CASE WHEN v.sso_user_id LIKE 'manual:%' THEN 'Người ngoài SSO' END) AS department_name
      FROM v_employees v WHERE v.pay_mode='fixed' AND v.sso_status='active' AND NOT v.excluded ORDER BY v.full_name`)]);
  const cnt = new Map(counts.map(c => [c.department_id, c.n]));
  return { groups, sheets, departments: departments.map(d => ({ ...d, employee_count: cnt.get(d.id) || 0 })), ssoDepartments: sso, unassignedEmployees: unassigned.n, totalEmployees: total.n, fixedPeople };
}));

// Xoá có kiểm tra: chưa có dữ liệu chấm công/lương thì gỡ liên kết con rồi xoá
router.delete('/sheets/:id', api(async req => {
  admin(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  if ((await one('SELECT count(*)::int n FROM periods WHERE sheet_id=$1', [req.params.id])).n) bad('Bảng chấm công này đã có dữ liệu chấm công nên không xoá được. Hãy chuyển sang "Ngừng dùng".', 409);
  await tx(async c => { await c.query('UPDATE departments SET sheet_id=NULL WHERE sheet_id=$1', [req.params.id]); await c.query('DELETE FROM sheets WHERE id=$1', [req.params.id]); });
  await audit(req, 'sheets.delete', 'sheets', req.params.id); return { ok: true };
}));
router.delete('/groups/:id', api(async req => {
  admin(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  if ((await one('SELECT count(*)::int n FROM payroll_runs WHERE group_id=$1', [req.params.id])).n) bad('Bảng lương này đã có dữ liệu lương nên không xoá được. Hãy chuyển sang "Ngừng dùng".', 409);
  await tx(async c => { await c.query('UPDATE sheets SET group_id=NULL WHERE group_id=$1', [req.params.id]); await c.query('DELETE FROM groups WHERE id=$1', [req.params.id]); });
  await audit(req, 'groups.delete', 'groups', req.params.id); return { ok: true };
}));
crud(router, { path: 'groups', table: 'groups', guard: admin, fields: [
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên bảng lương' },
  { k: 'kind', type: 'enum', values: ['plant', 'office'], label: 'Loại' }, { k: 'pay_type', type: 'enum', values: ['coef', 'fixed'], label: 'Loại tính lương' },
  { k: 'tax_threshold', type: 'num', min: 0, max: 1e11, label: 'Ngưỡng khấu trừ thuế vãng lai' }, { k: 'signers', type: 'signers', label: 'Người ký' }, { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });
crud(router, { path: 'sheets', table: 'sheets', guard: admin, fields: [
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên bảng chấm công' },
  { k: 'group_id', type: 'uuid', required: true, label: 'Bảng lương' }, { k: 'signers', type: 'signers', label: 'Người ký' },
  { k: 'print_title', label: 'Tiêu đề in' }, { k: 'use_safety', type: 'bool' }, { k: 'use_labor', type: 'bool' },
  { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });
crud(router, { path: 'departments', table: 'departments', guard: admin, after: reresolve, fields: [
  { k: 'code', required: true, label: 'Mã' }, { k: 'name', required: true, label: 'Tên phòng/đơn vị' },
  { k: 'sheet_id', type: 'uuid', label: 'Bảng chấm công' }, { k: 'meal_mode', type: 'enum', values: ['auto', 'actual', 'auto_wait'], label: 'Kiểu ăn ca' }, { k: 'active', type: 'bool' }, { k: 'sort_order', type: 'int' }] });

// Chọn NHIỀU bộ phận cho 1 bảng chấm công (1 bộ phận chỉ thuộc 1 bảng chấm công: tick = chuyển sang đây, bỏ tick = gỡ ra)
router.put('/sheets/:id/departments', api(async req => {
  admin(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const ids = [...new Set(Array.isArray(req.body?.departmentIds) ? req.body.departmentIds : [])]; if (ids.some(i => !isUuid(i))) bad('Bộ phận không hợp lệ');
  await tx(async c => {
    if (!(await c.query('SELECT 1 FROM sheets WHERE id=$1', [req.params.id])).rowCount) bad('Không tìm thấy bảng chấm công', 404);
    await c.query('UPDATE departments SET sheet_id=NULL WHERE sheet_id=$1 AND NOT (id = ANY($2::uuid[]))', [req.params.id, ids]);
    await c.query('UPDATE departments SET sheet_id=$1 WHERE id = ANY($2::uuid[])', [req.params.id, ids]);
  });
  await audit(req, 'sheet.set_departments', 'sheets', req.params.id, { ids }); return { ok: true, count: ids.length };
}));
// Chọn NHIỀU bảng chấm công cho 1 bảng lương (1 bảng chấm công chỉ thuộc 1 bảng lương)
router.put('/groups/:id/sheets', api(async req => {
  admin(req); if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const ids = [...new Set(Array.isArray(req.body?.sheetIds) ? req.body.sheetIds : [])]; if (ids.some(i => !isUuid(i))) bad('Bảng chấm công không hợp lệ');
  await tx(async c => {
    const g = (await c.query('SELECT pay_type FROM groups WHERE id=$1', [req.params.id])).rows[0];
    if (!g) bad('Không tìm thấy bảng lương', 404);
    if (g.pay_type === 'fixed' && ids.length) bad('Bảng lương khoán không dùng bảng chấm công. Chọn người ở nút "Chọn người lương khoán".');
    for (const sid of ids) {   // không cho chuyển bảng chấm công đã có dữ liệu sang bảng lương khác nếu bảng lương cũ đã có lương
      const cur = (await c.query('SELECT group_id FROM sheets WHERE id=$1', [sid])).rows[0];
      if (cur && cur.group_id && cur.group_id !== req.params.id && (await c.query('SELECT 1 FROM payroll_runs WHERE group_id=$1 LIMIT 1', [cur.group_id])).rowCount && (await c.query('SELECT 1 FROM periods WHERE sheet_id=$1 LIMIT 1', [sid])).rowCount)
        bad('Có bảng chấm công đã phát sinh dữ liệu ở bảng lương cũ, không nên chuyển. Nhờ Admin xử lý riêng.', 409);
    }
    await c.query('UPDATE sheets SET group_id=NULL WHERE group_id=$1 AND NOT (id = ANY($2::uuid[]))', [req.params.id, ids]);
    await c.query('UPDATE sheets SET group_id=$1 WHERE id = ANY($2::uuid[])', [req.params.id, ids]);
  });
  await audit(req, 'group.set_sheets', 'groups', req.params.id, { ids }); return { ok: true, count: ids.length };
}));
// Chọn NHIỀU người lương khoán cho 1 bảng lương khoán (mỗi người chỉ ở 1 bảng: tick = chuyển sang đây, bỏ tick = gỡ ra khỏi bảng này)
router.put('/groups/:id/members', api(async req => {
  if (!req.auth.isAdmin && !req.auth.can('people', {})) bad('Chỉ Admin hoặc người được phân quyền "Quản lý nhân sự" mới thực hiện được', 403);
  if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const ids = [...new Set(Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : [])]; if (ids.some(i => !isUuid(i))) bad('Nhân sự không hợp lệ');
  await tx(async c => {
    const g = (await c.query('SELECT pay_type FROM groups WHERE id=$1', [req.params.id])).rows[0];
    if (!g) bad('Không tìm thấy bảng lương', 404);
    if (g.pay_type !== 'fixed') bad('Chỉ bảng lương khoán mới chọn người theo cách này');
    await c.query(`UPDATE employees SET fixed_group_id=NULL, updated_at=now() WHERE fixed_group_id=$1 AND NOT (id = ANY($2::uuid[]))`, [req.params.id, ids]);
    await c.query(`UPDATE employees SET fixed_group_id=$1, updated_at=now() WHERE id = ANY($2::uuid[]) AND pay_mode='fixed'`, [req.params.id, ids]);
  });
  await require('../services/payroll').markStale(require('../db').pool);
  await audit(req, 'group.set_members', 'groups', req.params.id, { ids }); return { ok: true, count: ids.length };
}));
// Tạo nhanh bộ phận từ các phòng ban/đơn vị SSO chưa liên kết (mỗi mục SSO -> 1 bộ phận, tên giống SSO)
router.post('/import-sso', api(async req => {
  admin(req);
  const ids = [...new Set((Array.isArray(req.body?.ssoIds) ? req.body.ssoIds : []).map(String))];
  const sheetId = req.body?.sheetId || null; if (sheetId && !isUuid(sheetId)) bad('Bảng chấm công không hợp lệ');
  if (!ids.length) bad('Chưa chọn phòng ban SSO nào');
  const made = await tx(async c => {
    let n = 0;
    for (const id of ids) {
      const sso = (await c.query(`SELECT c.id, c.name FROM sso_departments_cache c WHERE c.id=$1 AND NOT EXISTS (SELECT 1 FROM department_sso_map m WHERE m.sso_department_id=c.id)`, [id])).rows[0];
      if (!sso) continue;
      const name = sso.name.replace(/\s*\(SSO\)\s*$/, '');
      const code = 'SSO-' + String(Date.now()).slice(-6) + '-' + (++n);
      const d = (await c.query('INSERT INTO departments(code, name, sheet_id, sort_order) VALUES($1,$2,$3,$4) RETURNING id', [code, name, sheetId, 100 + n])).rows[0];
      await c.query('INSERT INTO department_sso_map(sso_department_id, department_id) VALUES($1,$2)', [sso.id, d.id]);
    }
    await resolveEmployees(c); return n;
  });
  await audit(req, 'department.import_sso', 'department', null, { ids, made }); return { ok: true, created: made };
}));

// Chọn NHIỀU phòng ban SSO cho 1 phòng Payroll
router.put('/departments/:id/sso', api(async req => {
  admin(req);
  if (!isUuid(req.params.id)) bad('Mã không hợp lệ');
  const ids = [...new Set((Array.isArray(req.body?.ssoDepartmentIds) ? req.body.ssoDepartmentIds : []).map(String).filter(Boolean))];
  const n = await tx(async c => {
    const d = (await c.query('SELECT id FROM departments WHERE id=$1', [req.params.id])).rows[0];
    if (!d) bad('Không tìm thấy phòng/đơn vị', 404);
    await c.query('DELETE FROM department_sso_map WHERE department_id=$1', [d.id]);
    for (let i = 0; i < ids.length; i++) await c.query(`INSERT INTO department_sso_map(sso_department_id, department_id, sort_order) VALUES($1,$2,$3)
      ON CONFLICT (sso_department_id) DO UPDATE SET department_id=EXCLUDED.department_id, sort_order=EXCLUDED.sort_order`, [ids[i], d.id, i]);
    await resolveEmployees(c);
    return (await c.query(`SELECT count(*)::int n FROM v_employees WHERE department_id=$1 AND sso_status='active' AND payroll_active`, [d.id])).rows[0].n;
  });
  await audit(req, 'department.map_sso', 'department', req.params.id, { ssoDepartmentIds: ids });
  return { ok: true, employees: n };
}));

// Nạp sẵn cơ cấu SBM (chỉ khi chưa có bảng lương nào)
router.post('/seed-sbm', api(async req => {
  admin(req);
  if ((await one('SELECT count(*)::int n FROM groups')).n > 0) bad('Đã có cấu hình tổ chức, không nạp mẫu để tránh ghi đè', 409);
  await tx(async c => {
    const G = async (code, name, kind, so) => (await c.query('INSERT INTO groups(code,name,kind,sort_order) VALUES($1,$2,$3,$4) RETURNING id', [code, name, kind, so])).rows[0].id;
    const S = async (code, name, gid, so) => (await c.query('INSERT INTO sheets(code,name,group_id,sort_order) VALUES($1,$2,$3,$4) RETURNING id', [code, name, gid, so])).rows[0].id;
    const D = (code, name, sid, so) => c.query('INSERT INTO departments(code,name,sheet_id,sort_order) VALUES($1,$2,$3,$4)', [code, name, sid, so]);
    const vp = await G('VP', 'Khối văn phòng', 'office', 10);
    const a = await S('VP-KT', 'Phòng Kỹ thuật', vp, 10); await D('KT', 'Phòng Kỹ thuật', a, 10);
    const b = await S('VP-KETOAN', 'Phòng Kế toán', vp, 20); await D('KETOAN', 'Phòng Kế toán', b, 20);
    const k = await S('VP-KH', 'Phòng Kế hoạch', vp, 30); await D('KH', 'Phòng Kế hoạch', k, 30);
    const v = await S('VP-VP', 'Văn phòng (gồm HĐQT, Ban giám đốc, Ban kiểm soát)', vp, 40);
    await D('HDQT', 'Hội đồng quản trị', v, 41); await D('BGD', 'Ban giám đốc', v, 42); await D('BKS', 'Ban kiểm soát', v, 43); await D('VANPHONG', 'Văn phòng', v, 44);
    let so = 20;
    for (const [code, name] of [['TG', 'Thoong Gót'], ['NT', 'Nà Tẩu'], ['SS', 'Suối Sập']]) { const g = await G(code, name, 'plant', so); const s = await S(code, `Nhà máy ${name}`, g, 10); await D(code, `Nhà máy ${name}`, s, 10); so += 10; }
    const cum = await G('NC-TC', 'Cụm Nậm Công - Tà Cọ', 'plant', so);
    const sc = await S('NC-TC', 'Cụm Nậm Công - Tà Cọ', cum, 10);
    await D('NC', 'Nhà máy Nậm Công', sc, 10); await D('TC', 'Nhà máy Tà Cọ', sc, 20);
    // Tự liên kết: đơn vị ảo của SSO (HĐQT/BKS/BGĐ) và các phòng ban SSO có tên trùng
    const link = async (deptCode, match) => {
      const d = (await c.query('SELECT id FROM departments WHERE code=$1', [deptCode])).rows[0]; if (!d) return;
      for (const m of match) await c.query(`INSERT INTO department_sso_map(sso_department_id, department_id)
        SELECT id, $1::uuid FROM sso_departments_cache WHERE lower(id)=lower($2) OR lower(name) LIKE '%'||lower($2)||'%' ON CONFLICT (sso_department_id) DO NOTHING`, [d.id, m]);
    };
    await link('HDQT', ['role:HDQT']); await link('BGD', ['role:BGD']); await link('BKS', ['role:BKS']);
    await link('KT', ['kỹ thuật']); await link('KETOAN', ['kế toán']); await link('KH', ['kế hoạch']); await link('VANPHONG', ['văn phòng']);
    await link('TG', ['thoong']); await link('NT', ['nà tẩu']); await link('SS', ['suối sập']); await link('NC', ['nậm công']); await link('TC', ['tà cọ']);
    await resolveEmployees(c);
  });
  await audit(req, 'org.seed', 'org', null, null);
  return { ok: true };
}));
module.exports = router;
