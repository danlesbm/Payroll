// Phân quyền theo (vai trò, phạm vi). Phạm vi: all | group (bảng lương) | sheet (bảng chấm công).
const ROLES = {
  admin:      'Quản trị Payroll',
  timekeeper: 'Người chấm công',
  l1:         'Kiểm soát cấp 1 (trưởng/phó phòng, GĐ nhà máy)',
  l2:         'Kiểm soát cấp 2 (nhận công, điều chỉnh, chạy lương)',
  l3:         'Kiểm soát cấp 3 (kiểm soát cuối)',
  director:   'Giám đốc (ký, thay thế cấp 3)',
  hr:         'Quản lý hệ số, đơn giá, thưởng/trừ (gồm lương cơ sở, loại hệ số, khoản trừ, hệ số hoàn thành kế hoạch)',
  cfg_att:    'Cài đặt chấm công (ký hiệu công, tiền ăn ca, công chuẩn, ngày lễ, nhóm phụ cấp)',
  people:     'Quản lý nhân sự (loại, kíp, nghỉ hằng tuần, nhóm phụ cấp, tính lương, mã NV)',
  view_att:   'Chỉ xem bảng chấm công (không sửa, không xem lương)',
  view_pay:   'Chỉ xem bảng lương, thưởng, ăn ca, hệ số (không sửa)'
};
const expand = role => role === 'l3' ? ['l3', 'director'] : [role];   // Giám đốc làm được việc của cấp 3
function can(assignments, role, ctx = {}, isAdmin = false) {
  if (isAdmin) return true;
  const roles = expand(role);
  return (assignments || []).some(a => roles.includes(a.role) && (
    a.scope_type === 'all' ||
    (a.scope_type === 'group' && ctx.groupId && String(a.scope_id) === String(ctx.groupId)) ||
    (a.scope_type === 'sheet' && ctx.sheetId && String(a.scope_id) === String(ctx.sheetId))));
}
// Các phòng/bộ phận mà người dùng được gán riêng (phạm vi 'department') cho một trong các quyền
const deptIds = (assignments, roleList) => new Set((assignments || []).filter(a => a.scope_type === 'department' && roleList.includes(a.role)).map(a => String(a.scope_id)));
// Quyền chỉ gán được ở một số phạm vi
const SCOPES_OF = role => role === 'cfg_att' || role === 'people' || role === 'admin' ? ['all'] : (role === 'timekeeper' || role === 'view_att') ? ['all', 'group', 'sheet', 'department'] : ['all', 'group', 'sheet'];
const canAny = (assignments, roleList, ctx, isAdmin) => roleList.some(r => can(assignments, r, ctx, isAdmin));
module.exports = { ROLES, can, canAny, deptIds, SCOPES_OF };
