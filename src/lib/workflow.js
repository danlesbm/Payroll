// Quy trình bảng chấm công (máy trạng thái thuần). Mỗi cấp CHỈ sửa được khi bảng đang ở bước của mình.
//  draft ─submit→ pending_l1 ─l1_approve→ pending_l2 ─send_final→ pending_l3 ─l3_submit→ pending_dir ─complete→ locked
//  Trả lại: l1_return / l2_return → draft (người chấm sửa)  |  l3_return → pending_l2  |  dir_return → pending_l3
//  reopen (chỉ Admin, bắt buộc lý do, có lịch sử): locked / pending_dir / pending_l3 → pending_l2
const STATUS_LABEL = {
  draft: 'Đang chấm', pending_l1: 'Cấp 1 kiểm soát', pending_l2: 'Cấp 2 xử lý & chạy lương',
  pending_l3: 'Cấp 3 kiểm soát', pending_dir: 'Chờ Giám đốc khoá', locked: 'Đã khoá (chính thức)'
};
const TRANSITIONS = {
  submit:     { from: ['draft'],       to: 'pending_l1', role: 'timekeeper', label: 'Gửi kiểm soát' },
  l1_approve: { from: ['pending_l1'],  to: 'pending_l2', role: 'l1', label: 'Cấp 1 duyệt, trình cấp 2' },
  l1_return:  { from: ['pending_l1'],  to: 'draft',      role: 'l1', label: 'Trả lại người chấm', needNote: true },
  l2_return:  { from: ['pending_l2'],  to: 'draft',      role: 'l2', label: 'Trả lại người chấm', needNote: true },
  send_final: { from: ['pending_l2'],  to: 'pending_l3', role: 'l2', label: 'Cấp 2 chốt, trình cấp 3' },
  l3_return:  { from: ['pending_l3'],  to: 'pending_l2', role: 'l3', label: 'Trả lại cấp 2', needNote: true },
  l3_submit:  { from: ['pending_l3'],  to: 'pending_dir', role: 'l3', label: 'Cấp 3 chốt, trình Giám đốc' },
  dir_return: { from: ['pending_dir'], to: 'pending_l3', role: 'director', label: 'Trả lại cấp 3', needNote: true },
  complete:   { from: ['pending_dir'], to: 'locked',     role: 'director', label: 'Giám đốc khoá & ký' },
  reopen:     { from: ['locked', 'pending_dir', 'pending_l3'], to: 'pending_l2', role: 'admin', label: 'Mở khoá (Admin)', needNote: true }
};
function nextStatus(action, status, opts = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw new Error('Thao tác không hợp lệ: ' + action);
  if (!t.from.includes(status)) throw new Error(`Không thể "${t.label}" khi bảng đang ở trạng thái "${STATUS_LABEL[status] || status}"`);
  if (action === 'submit' && opts.requireL1 === false) return 'pending_l2';
  return t.to;
}
// Vai trò được sửa công ở từng bước (các bước còn lại chỉ xem)
const EDITOR = { draft: 'timekeeper', pending_l1: 'l1', pending_l2: 'l2', pending_l3: 'l3' };
const editorRole = status => EDITOR[status] || null;
const isReceived = s => ['pending_l2', 'pending_l3', 'pending_dir', 'locked'].includes(s);
module.exports = { STATUS_LABEL, TRANSITIONS, nextStatus, editorRole, isReceived };
