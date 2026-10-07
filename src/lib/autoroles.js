// Quyền TỰ ĐỘNG suy từ chức vụ SSO (không cần cài tay):
//  - Kiểm soát cấp 1 của một bảng chấm công = Trưởng phòng (Giám đốc nhà máy) của phòng đó;
//    phòng không có Trưởng thì là Phó phòng (P. Giám đốc nhà máy).
//  - Giám đốc công ty = người có chức vụ "Giám đốc" trong SSO (ký + kiểm soát cuối, toàn hệ thống).
const rows = (...a) => require('../db').rows(...a);
const SQL = `SELECT e.sso_user_id, e.full_name, e.positions, d.name AS dept_name, d.sheet_id, s.name AS sheet_name,
    EXISTS (SELECT 1 FROM employees h WHERE h.mapped_department_id = e.mapped_department_id AND h.id <> e.id AND NOT h.excluded AND h.sso_status='active'
            AND (',' || replace(coalesce(h.positions,''), ', ', ',') || ',') LIKE '%,Trưởng phòng,%') AS dept_has_head
  FROM employees e LEFT JOIN departments d ON d.id = e.mapped_department_id LEFT JOIN sheets s ON s.id = d.sheet_id
  WHERE NOT e.excluded AND e.sso_status='active' AND ($1::text IS NULL OR e.sso_user_id = $1)`;
function derive(list) {
  const out = [];
  for (const r of list) {
    const pos = String(r.positions || '').split(',').map(x => x.trim());
    const base = { sso_user_id: r.sso_user_id, full_name: r.full_name, positions: r.positions, auto: true };
    if (r.sheet_id && pos.includes('Trưởng phòng')) out.push({ ...base, role: 'l1', scope_type: 'sheet', scope_id: r.sheet_id, scope_name: r.sheet_name, reason: 'Trưởng phòng ' + r.dept_name });
    else if (r.sheet_id && pos.includes('Phó phòng') && !r.dept_has_head) out.push({ ...base, role: 'l1', scope_type: 'sheet', scope_id: r.sheet_id, scope_name: r.sheet_name, reason: 'Phó phòng ' + r.dept_name + ' (phòng chưa có Trưởng)' });
    if (pos.includes('Giám đốc')) out.push({ ...base, role: 'director', scope_type: 'all', scope_id: '', scope_name: 'Toàn hệ thống', reason: 'Giám đốc công ty' });
  }
  return out;
}
const forUser = async id => derive(await rows(SQL, [id]));
const forAll = async () => derive(await rows(SQL, [null]));
module.exports = { derive, forUser, forAll };
